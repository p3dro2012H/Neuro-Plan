import express, { Request, Response, NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { Database, HttpError } from "./database";
import { StudyService } from "./study";
import { mountPlanning } from "./planning";
import { AssistantProvider, groqProvider } from "./groq";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const cookieName = "pausa_auth";
const token = (req: Request) =>
  req.headers.cookie
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1) ?? "";
const idSchema = z.uuid();
const fatigue = z.number().int().min(1).max(5);
type Options = {
  production?: boolean;
  origin?: string;
  clock?: () => number;
  loginLimit?: number;
  frontendPath?: string;
  assistantProvider?: AssistantProvider | null;
  assistantTimeoutMs?: number;
};
export function createApp(db: Database, options: Options = {}) {
  const app = express();
  const clock = options.clock ?? Date.now;
  const study = new StudyService(db, clock);
  const origin = options.origin ?? "http://localhost:5173";
  app.disable("x-powered-by");
  if (options.production) app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=()");
    res.setHeader("X-Frame-Options", "DENY");
    if (options.production)
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'",
      );
    next();
  });
  app.use(express.json({ limit: "128kb" }));
  app.use((req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (
        (req.headers.origin && req.headers.origin !== origin) ||
        (!req.headers.origin && options.production)
      ) {
        res.status(403).json({ erro: "Origem da requisição não permitida." });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ erro: "Envie JSON." });
        return;
      }
    }
    next();
  });
  const wrap =
    (handler: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      handler(req, res).catch(next);
    };
  const cookie = (res: Response, value: string) =>
    res.cookie(cookieName, value, {
      httpOnly: true,
      secure: !!options.production,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 86400000,
    });
  const login = async (user: number, res: Response) => {
    const value = randomBytes(32).toString("hex");
    await db.query("DELETE FROM autenticacoes WHERE expira_em <= $1", [
      new Date(clock()),
    ]);
    await db.query(
      "INSERT INTO autenticacoes(token_hash,usuario_id,expira_em) VALUES($1,$2,$3)",
      [sha(value), user, new Date(clock() + 7 * 86400000)],
    );
    cookie(res, value);
  };
  const publicUser = (u: any) => ({ id: u.id, nome: u.nome, email: u.email });
  const limiter = rateLimit({
    windowMs: 15 * 60000,
    limit: options.loginLimit ?? 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { erro: "Muitas tentativas. Tente novamente em 15 minutos." },
  });
  const authPaths = ["/auth/cadastro", "/auth/login"];
  app.use(authPaths, limiter);
  app.post(
    "/auth/cadastro",
    wrap(async (req, res) => {
      const input = z
        .object({
          nome: z.string().trim().min(2).max(150),
          email: z
            .email()
            .max(150)
            .transform((s) => s.toLowerCase().trim()),
          senha: z
            .string()
            .min(8)
            .max(72)
            .refine(
              (s) => Buffer.byteLength(s, "utf8") <= 72,
              "Senha deve ter até 72 bytes.",
            ),
        })
        .parse(req.body);
      const hash = await bcrypt.hash(input.senha, 12);
      const u = (
        await db.query(
          "INSERT INTO usuarios(nome,email,senha_hash) VALUES($1,$2,$3) RETURNING id,nome,email",
          [input.nome, input.email, hash],
        )
      ).rows[0];
      await login(u.id, res);
      res.status(201).json(publicUser(u));
    }),
  );
  // Hash válido para equilibrar o trabalho no caso de e-mail inexistente.
  const dummyHash = bcrypt.hashSync("credencial-inexistente", 12);
  app.post(
    "/auth/login",
    wrap(async (req, res) => {
      const input = z
        .object({
          email: z
            .email()
            .max(150)
            .transform((s) => s.toLowerCase()),
          senha: z.string().min(1).max(72),
        })
        .parse(req.body);
      const u = (
        await db.query("SELECT * FROM usuarios WHERE lower(email)=$1", [
          input.email,
        ])
      ).rows[0];
      const valid = await bcrypt.compare(
        input.senha,
        u?.senha_hash ?? dummyHash,
      );
      if (!u || !valid) throw new HttpError(401, "E-mail ou senha incorretos.");
      const previous = token(req);
      if (previous)
        await db.query("DELETE FROM autenticacoes WHERE token_hash=$1", [
          sha(previous),
        ]);
      await login(u.id, res);
      res.json(publicUser(u));
    }),
  );
  app.post(
    "/auth/logout",
    wrap(async (req, res) => {
      await db.query("DELETE FROM autenticacoes WHERE token_hash=$1", [
        sha(token(req)),
      ]);
      res.clearCookie(cookieName, {
        httpOnly: true,
        secure: !!options.production,
        sameSite: "lax",
        path: "/",
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/health",
    wrap(async (_req, res) => {
      await db.query("SELECT 1");
      res.json({ status: "ok" });
    }),
  );
  const authenticate = async (req: Request, res: Response) => {
    const t = token(req);
    const u = /^[a-f0-9]{64}$/.test(t)
      ? (
          await db.query(
            "SELECT u.id,u.nome,u.email FROM autenticacoes a JOIN usuarios u ON u.id=a.usuario_id WHERE a.token_hash=$1 AND a.expira_em>$2",
            [sha(t), new Date(clock())],
          )
        ).rows[0]
      : null;
    if (!u) throw new HttpError(401, "Entre na sua conta para continuar.");
    res.locals.user = u;
  };
  app.use(
    [
      "/auth/me",
      "/sessoes",
      "/alertas",
      "/planejamento",
      "/planejamentos",
      "/tarefas",
      "/assistente",
    ],
    (req, res, next) => {
      authenticate(req, res)
        .then(() => next())
        .catch(next);
    },
  );
  app.get(
    "/auth/me",
    wrap(async (_req, res) => {
      res.json(publicUser(res.locals.user));
    }),
  );
  app.get(
    "/sessoes/ativa",
    wrap(async (_req, res) => {
      res.json(await study.active(res.locals.user.id));
    }),
  );
  app.get(
    "/sessoes",
    wrap(async (req, res) => {
      const offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(100000)
        .parse(req.query.offset ?? 0);
      res.json(await study.list(res.locals.user.id, offset));
    }),
  );
  app.post(
    "/sessoes",
    wrap(async (req, res) => {
      const i = z
        .object({
          materia: z.string().trim().min(1).max(150),
          cansaco: fatigue,
        })
        .parse(req.body);
      res
        .status(201)
        .json(await study.start(res.locals.user.id, i.materia, i.cansaco));
    }),
  );
  app.get(
    "/sessoes/:id",
    wrap(async (req, res) => {
      res.json(
        await study.get(res.locals.user.id, idSchema.parse(req.params.id)),
      );
    }),
  );
  app.post(
    "/sessoes/:id/avaliar",
    wrap(async (req, res) => {
      res.json(
        await study.get(
          res.locals.user.id,
          idSchema.parse(req.params.id),
          true,
        ),
      );
    }),
  );
  app.post(
    "/sessoes/:id/autorrelatos",
    wrap(async (req, res) => {
      const i = z.object({ cansaco: fatigue }).parse(req.body);
      res.json(
        await study.report(
          res.locals.user.id,
          idSchema.parse(req.params.id),
          i.cansaco,
        ),
      );
    }),
  );
  app.post(
    "/sessoes/:id/encerrar",
    wrap(async (req, res) => {
      const i = z.object({ cansaco: fatigue }).parse(req.body);
      res.json(
        await study.finish(
          res.locals.user.id,
          idSchema.parse(req.params.id),
          i.cansaco,
        ),
      );
    }),
  );
  app.post(
    "/sessoes/:id/pausas",
    wrap(async (req, res) => {
      const i = z
        .object({
          acao: z.enum(["manual", "aceitar", "adiar", "concluir"]),
          pausaId: z.number().int().positive().optional(),
        })
        .parse(req.body);
      if (i.acao !== "manual" && !i.pausaId)
        throw new HttpError(400, "Informe pausaId.");
      res.json(
        await study.pause(
          res.locals.user.id,
          idSchema.parse(req.params.id),
          i.acao,
          i.pausaId,
        ),
      );
    }),
  );
  app.post(
    "/alertas",
    wrap(async (req, res) => {
      const i = z
        .object({
          sessionId: idSchema,
          eventoId: idSchema,
          tipo: z.enum(["OLHOS_FECHADOS", "BOCEJO"]),
          valorMetrica: z.number().finite().min(0).max(5),
          timestamp: z.iso.datetime({ offset: true }),
        })
        .parse(req.body);
      const result = await study.alert(res.locals.user.id, i);
      res.status(result.duplicado ? 200 : 201).json(result);
    }),
  );
  mountPlanning(app, db, {
    clock,
    provider:
      options.assistantProvider !== undefined
        ? (options.assistantProvider ?? undefined)
        : process.env.GROQ_API_KEY?.trim()
          ? groqProvider(
              process.env.GROQ_API_KEY.trim(),
              process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-20b",
            )
          : undefined,
    timeoutMs: options.assistantTimeoutMs,
  });
  app.use(
    [
      "/auth",
      "/sessoes",
      "/alertas",
      "/planejamento",
      "/planejamentos",
      "/tarefas",
      "/assistente",
    ],
    (_req, res) => {
      res.status(404).json({ erro: "Endpoint não encontrado." });
    },
  );
  const frontend =
    options.frontendPath ?? path.resolve(__dirname, "../../frontend/dist");
  app.use(express.static(frontend));
  app.get("*", (_req, res, next) =>
    res.sendFile(
      path.join(frontend, "index.html"),
      (error) => error && next(error),
    ),
  );
  app.use((error: any, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        erro: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ erro: error.message });
      return;
    }
    if (error.code === "23505") {
      res.status(409).json({
        erro: "Registro já existente. Atualize a página ou use outro e-mail.",
      });
      return;
    }
    if (error.type === "entity.parse.failed") {
      res.status(400).json({ erro: "JSON inválido." });
      return;
    }
    console.error("Falha na API:", error.code ?? error.name);
    res.status(503).json({
      erro: "Não foi possível salvar ou consultar os dados. Tente reconectar.",
    });
  });
  return app;
}
