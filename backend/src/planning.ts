import { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import { Connection, Database, HttpError, transaction } from "./database";
import { AssistantProvider } from "./groq";
import {
  blockSchema,
  horizon,
  localParts,
  preferencesSchema,
  Preferences,
  proposalSchema,
  Proposal,
  replySchema,
  taskSchema,
  validateBlocks,
} from "./planning-schema";

const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const uuid = z.uuid();
const taskView = (row: any) => ({
  id: row.id,
  titulo: row.titulo,
  materia: row.materia,
  prazo: row.prazo,
  estimativaMin: row.estimativa_min,
  prioridade: row.prioridade,
  concluida: row.concluida,
});
const blockView = (row: any) => ({
  id: row.id,
  titulo: row.titulo,
  materia: row.materia,
  tipo: row.tipo,
  inicio: row.inicio,
  fim: row.fim,
  tarefaRef: row.tarefa_id,
});
export type PlanningOptions = {
  clock: () => number;
  provider?: AssistantProvider;
  timeoutMs?: number;
};
export class PlanningService {
  constructor(
    private db: Database,
    private options: PlanningOptions,
  ) {}
  private async lock(cx: Connection, user: number) {
    await cx.query("SELECT id FROM usuarios WHERE id=$1 FOR UPDATE", [user]);
  }
  private async preferences(
    cx: Pick<Connection, "query">,
    user: number,
  ): Promise<Preferences> {
    const row = (
      await cx.query(
        "SELECT * FROM planejamento_preferencias WHERE usuario_id=$1",
        [user],
      )
    ).rows[0];
    return row
      ? {
          fuso: row.fuso,
          disponibilidade: row.disponibilidade,
          compromissos: row.compromissos,
        }
      : { fuso: "UTC", disponibilidade: [], compromissos: [] };
  }
  async getPreferences(user: number) {
    const pref = await this.preferences(this.db, user);
    const configured =
      (
        await this.db.query(
          "SELECT usuario_id FROM planejamento_preferencias WHERE usuario_id=$1",
          [user],
        )
      ).rows.length > 0;
    return { ...pref, configurada: configured };
  }
  async setPreferences(user: number, value: unknown) {
    const input = preferencesSchema.parse(value);
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const future = (
        await cx.query(
          "SELECT * FROM planejamento_blocos WHERE usuario_id=$1 AND inicio >= $2",
          [user, new Date(this.options.clock())],
        )
      ).rows;
      if (future.length)
        validateBlocks(future.map(blockView), input, [], this.options.clock());
      await cx.query(
        "INSERT INTO planejamento_preferencias(usuario_id,fuso,disponibilidade,compromissos) VALUES($1,$2,$3,$4) ON CONFLICT(usuario_id) DO UPDATE SET fuso=EXCLUDED.fuso,disponibilidade=EXCLUDED.disponibilidade,compromissos=EXCLUDED.compromissos",
        [
          user,
          input.fuso,
          JSON.stringify(input.disponibilidade),
          JSON.stringify(input.compromissos),
        ],
      );
      return input;
    });
  }
  async tasks(user: number) {
    return (
      await this.db.query(
        "SELECT * FROM tarefas WHERE usuario_id=$1 ORDER BY concluida, criado_em DESC",
        [user],
      )
    ).rows.map(taskView);
  }
  private async insertTask(
    cx: Connection,
    user: number,
    data: z.infer<typeof taskSchema>,
  ) {
    return taskView(
      (
        await cx.query(
          "INSERT INTO tarefas(usuario_id,titulo,materia,prazo,estimativa_min,prioridade,concluida) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            user,
            data.titulo,
            data.materia,
            data.prazo,
            data.estimativaMin,
            data.prioridade,
            data.concluida,
          ],
        )
      ).rows[0],
    );
  }
  async createTask(user: number, value: unknown) {
    const input = taskSchema.parse(value);
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      return this.insertTask(cx, user, input);
    });
  }
  async editTask(user: number, id: string, value: unknown) {
    const input = taskSchema.parse(value);
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const row = (
        await cx.query(
          "UPDATE tarefas SET titulo=$3,materia=$4,prazo=$5,estimativa_min=$6,prioridade=$7,concluida=$8 WHERE id=$1 AND usuario_id=$2 RETURNING *",
          [
            id,
            user,
            input.titulo,
            input.materia,
            input.prazo,
            input.estimativaMin,
            input.prioridade,
            input.concluida,
          ],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "Tarefa não encontrada.");
      return taskView(row);
    });
  }
  async removeTask(user: number, id: string) {
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const rows = (
        await cx.query(
          "DELETE FROM tarefas WHERE id=$1 AND usuario_id=$2 RETURNING id",
          [id, user],
        )
      ).rows;
      if (!rows.length) throw new HttpError(404, "Tarefa não encontrada.");
      return { removida: true };
    });
  }
  async blocks(user: number) {
    const pref = await this.getPreferences(user);
    const range = horizon(this.options.clock(), pref.fuso);
    const rows = (
      await this.db.query(
        "SELECT * FROM planejamento_blocos WHERE usuario_id=$1 ORDER BY inicio",
        [user],
      )
    ).rows;
    return {
      fuso: pref.fuso,
      ...range,
      blocos: rows
        .filter((b) => {
          const date = localParts(b.inicio, pref.fuso).date;
          return date >= range.first && date <= range.last;
        })
        .map(blockView),
    };
  }
  private async validateProposal(
    cx: Pick<Connection, "query">,
    user: number,
    input: Proposal,
    excludeId?: string,
  ) {
    const existing = (
      await cx.query(
        "SELECT * FROM planejamento_blocos WHERE usuario_id=$1 AND ($2::uuid IS NULL OR id<>$2)",
        [user, excludeId ?? null],
      )
    ).rows;
    validateBlocks(
      input.blocos,
      await this.preferences(cx, user),
      existing,
      this.options.clock(),
    );
    const refs = new Set<string>();
    for (const task of input.tarefas) {
      if (refs.has(task.ref) || uuid.safeParse(task.ref).success)
        throw new HttpError(
          400,
          "Referências de novas tarefas devem ser únicas e diferentes dos IDs existentes.",
        );
      refs.add(task.ref);
    }
    for (const block of input.blocos) {
      if (!block.tarefaRef || refs.has(block.tarefaRef)) continue;
      if (!uuid.safeParse(block.tarefaRef).success)
        throw new HttpError(400, "Referência de tarefa inválida.");
      const task = (
        await cx.query("SELECT * FROM tarefas WHERE id=$1 AND usuario_id=$2", [
          block.tarefaRef,
          user,
        ])
      ).rows[0];
      if (!task || task.concluida)
        throw new HttpError(
          400,
          "A agenda deve usar somente suas tarefas pendentes.",
        );
      if (task.prazo && Date.parse(block.fim) > new Date(task.prazo).getTime())
        throw new HttpError(400, "Um bloco termina depois do prazo da tarefa.");
    }
    for (const task of input.tarefas)
      if (
        task.prazo &&
        input.blocos.some(
          (b) =>
            b.tarefaRef === task.ref &&
            Date.parse(b.fim) > Date.parse(task.prazo!),
        )
      )
        throw new HttpError(
          400,
          "Um bloco termina depois do prazo da tarefa nova.",
        );
  }
  private async insertProposal(cx: Connection, user: number, input: Proposal) {
    const tasks = [];
    const blocks = [];
    const refs = new Map<string, string>();
    for (const task of input.tarefas) {
      const { ref, ...data } = task;
      const row = await this.insertTask(cx, user, taskSchema.parse(data));
      tasks.push(row);
      refs.set(ref, row.id);
    }
    for (const block of input.blocos) {
      const row = (
        await cx.query(
          "INSERT INTO planejamento_blocos(usuario_id,tarefa_id,titulo,materia,tipo,inicio,fim) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
          [
            user,
            block.tarefaRef
              ? (refs.get(block.tarefaRef) ?? block.tarefaRef)
              : null,
            block.titulo,
            block.materia,
            block.tipo,
            block.inicio,
            block.fim,
          ],
        )
      ).rows[0];
      blocks.push(blockView(row));
    }
    return { tarefas: tasks, blocos: blocks };
  }
  async savePlan(user: number, value: unknown) {
    const input = z
      .object({
        pedidoId: uuid,
        tarefas: proposalSchema.shape.tarefas,
        blocos: proposalSchema.shape.blocos,
      })
      .strict()
      .parse(value);
    const proposal = { tarefas: input.tarefas, blocos: input.blocos };
    const signature = hash(proposal);
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const prior = (
        await cx.query(
          "SELECT * FROM planejamento_confirmacoes WHERE usuario_id=$1 AND pedido_id=$2",
          [user, input.pedidoId],
        )
      ).rows[0];
      if (prior) {
        if (prior.assinatura !== signature)
          throw new HttpError(
            409,
            "O identificador já foi usado para outro planejamento.",
          );
        return prior.resultado;
      }
      await this.validateProposal(cx, user, proposal);
      const result = await this.insertProposal(cx, user, proposal);
      await cx.query(
        "INSERT INTO planejamento_confirmacoes VALUES($1,$2,$3,$4)",
        [user, input.pedidoId, signature, JSON.stringify(result)],
      );
      return result;
    });
  }
  async editBlock(user: number, id: string, value: unknown) {
    const input = blockSchema.parse(value);
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      if (
        !(
          await cx.query(
            "SELECT id FROM planejamento_blocos WHERE id=$1 AND usuario_id=$2",
            [id, user],
          )
        ).rows.length
      )
        throw new HttpError(404, "Bloco não encontrado.");
      await this.validateProposal(
        cx,
        user,
        { tarefas: [], blocos: [input] },
        id,
      );
      return blockView(
        (
          await cx.query(
            "UPDATE planejamento_blocos SET tarefa_id=$3,titulo=$4,materia=$5,tipo=$6,inicio=$7,fim=$8 WHERE id=$1 AND usuario_id=$2 RETURNING *",
            [
              id,
              user,
              input.tarefaRef,
              input.titulo,
              input.materia,
              input.tipo,
              input.inicio,
              input.fim,
            ],
          )
        ).rows[0],
      );
    });
  }
  async removeBlock(user: number, id: string) {
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const rows = (
        await cx.query(
          "DELETE FROM planejamento_blocos WHERE id=$1 AND usuario_id=$2 RETURNING id",
          [id, user],
        )
      ).rows;
      if (!rows.length) throw new HttpError(404, "Bloco não encontrado.");
      return { removido: true };
    });
  }
  async history(user: number) {
    return (
      await this.db.query(
        "SELECT m.*,p.id AS proposta_id,p.dados AS proposta,p.estado AS proposta_estado FROM assistente_mensagens m LEFT JOIN assistente_propostas p ON p.mensagem_id=m.id WHERE m.usuario_id=$1 ORDER BY m.criado_em DESC LIMIT 30",
        [user],
      )
    ).rows.reverse();
  }
  async clearHistory(user: number) {
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      await cx.query("DELETE FROM assistente_mensagens WHERE usuario_id=$1", [
        user,
      ]);
      return { removidas: true };
    });
  }
  private async message(user: number, id: string) {
    return (
      await this.db.query(
        "SELECT m.*,p.id AS proposta_id,p.dados AS proposta,p.estado AS proposta_estado FROM assistente_mensagens m LEFT JOIN assistente_propostas p ON p.mensagem_id=m.id WHERE m.usuario_id=$1 AND m.id=$2",
        [user, id],
      )
    ).rows[0];
  }
  async proposal(user: number, id: string) {
    const row = (
      await this.db.query(
        "SELECT * FROM assistente_propostas WHERE id=$1 AND usuario_id=$2",
        [id, user],
      )
    ).rows[0];
    if (!row) throw new HttpError(404, "Proposta não encontrada.");
    return row;
  }
  async editProposal(user: number, id: string, value: unknown) {
    const input = proposalSchema.parse(value);
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const row = (
        await cx.query(
          "SELECT * FROM assistente_propostas WHERE id=$1 AND usuario_id=$2 AND estado='RASCUNHO' FOR UPDATE",
          [id, user],
        )
      ).rows[0];
      if (!row) throw new HttpError(409, "Proposta indisponível para edição.");
      await this.validateProposal(cx, user, input);
      await cx.query(
        "UPDATE assistente_propostas SET dados=$3 WHERE id=$1 AND usuario_id=$2",
        [id, user, JSON.stringify(input)],
      );
      return { ...row, dados: input };
    });
  }
  async discard(user: number, id: string) {
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const row = (
        await cx.query(
          "UPDATE assistente_propostas SET estado='DESCARTADA' WHERE id=$1 AND usuario_id=$2 AND estado='RASCUNHO' RETURNING *",
          [id, user],
        )
      ).rows[0];
      if (!row) throw new HttpError(409, "Proposta indisponível.");
      return row;
    });
  }
  async confirm(user: number, id: string) {
    return transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const row = (
        await cx.query(
          "SELECT * FROM assistente_propostas WHERE id=$1 AND usuario_id=$2 FOR UPDATE",
          [id, user],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "Proposta não encontrada.");
      const prior = (
        await cx.query(
          "SELECT resultado FROM planejamento_confirmacoes WHERE usuario_id=$1 AND pedido_id=$2",
          [user, id],
        )
      ).rows[0];
      if (prior) return prior.resultado;
      if (row.estado !== "RASCUNHO")
        throw new HttpError(409, "Proposta descartada.");
      const input = proposalSchema.parse(row.dados);
      await this.validateProposal(cx, user, input);
      const result = await this.insertProposal(cx, user, input);
      await cx.query(
        "INSERT INTO planejamento_confirmacoes VALUES($1,$2,$3,$4)",
        [user, id, hash(input), JSON.stringify(result)],
      );
      await cx.query(
        "UPDATE assistente_propostas SET estado='CONFIRMADA' WHERE id=$1",
        [id],
      );
      return result;
    });
  }
  async send(user: number, value: unknown) {
    if (!this.options.provider)
      throw new HttpError(
        503,
        "O assistente está temporariamente indisponível. Tente novamente mais tarde ou use o planejamento manual.",
      );
    const input = z
      .object({
        pedidoId: uuid,
        texto: z.string().trim().min(1).max(2000),
        tarefaIds: z.array(uuid).max(30).default([]),
      })
      .strict()
      .parse(value);
    const signature = hash({ texto: input.texto, tarefaIds: input.tarefaIds });
    const now = this.options.clock();
    const prepared = await transaction(this.db, async (cx) => {
      await this.lock(cx, user);
      const prior = (
        await cx.query("SELECT * FROM assistente_mensagens WHERE id=$1", [
          input.pedidoId,
        ])
      ).rows[0];
      if (
        prior &&
        (prior.usuario_id !== user || prior.assinatura !== signature)
      )
        throw new HttpError(
          409,
          "O identificador já foi usado para outra mensagem.",
        );
      if (prior?.estado === "CONCLUIDA") return { done: true };
      if (
        prior?.estado === "PROCESSANDO" &&
        now - new Date(prior.atualizado_em).getTime() < 31000
      )
        throw new HttpError(409, "Esta mensagem já está sendo processada.");
      if (
        (
          await cx.query(
            "SELECT id FROM assistente_mensagens WHERE usuario_id=$1 AND estado='PROCESSANDO' AND atualizado_em>$2",
            [user, new Date(now - 31000)],
          )
        ).rows.length
      )
        throw new HttpError(409, "Aguarde a resposta anterior.");
      const dayStart = Math.floor(now / 86400000) * 86400000;
      const usage = (
        await cx.query(
          "SELECT criado_em FROM assistente_uso WHERE usuario_id=$1 AND criado_em >= $2",
          [user, new Date(Math.min(dayStart, now - 60000))],
        )
      ).rows;
      if (
        usage.filter((u) => new Date(u.criado_em).getTime() >= dayStart)
          .length >= 20 ||
        usage.filter((u) => new Date(u.criado_em).getTime() > now - 60000)
          .length >= 5
      )
        throw new HttpError(
          429,
          "Limite do assistente atingido. São cinco pedidos por minuto e vinte por dia (UTC).",
        );
      const tasks = (
        await cx.query(
          "SELECT * FROM tarefas WHERE usuario_id=$1 AND id=ANY($2::uuid[])",
          [user, input.tarefaIds],
        )
      ).rows;
      if (
        tasks.length !== new Set(input.tarefaIds).size ||
        tasks.some((t) => t.concluida)
      )
        throw new HttpError(400, "Selecione somente suas tarefas pendentes.");
      const prefs = await this.preferences(cx, user);
      const blocks = (
        await cx.query(
          "SELECT * FROM planejamento_blocos WHERE usuario_id=$1 AND fim>=$2 ORDER BY inicio LIMIT 56",
          [user, new Date(now)],
        )
      ).rows;
      const history = (
        await cx.query(
          "SELECT texto,resposta FROM assistente_mensagens WHERE usuario_id=$1 AND estado='CONCLUIDA' ORDER BY criado_em DESC LIMIT 6",
          [user],
        )
      ).rows
        .reverse()
        .flatMap((m) => [
          { role: "user" as const, texto: m.texto },
          { role: "model" as const, texto: m.resposta },
        ]);
      await cx.query("INSERT INTO assistente_uso VALUES($1,$2)", [
        user,
        new Date(now),
      ]);
      await cx.query(
        "INSERT INTO assistente_mensagens(id,usuario_id,assinatura,texto,estado,criado_em,atualizado_em,tarefa_ids) VALUES($1,$2,$3,$4,'PROCESSANDO',$5,$5,$6) ON CONFLICT(id) DO UPDATE SET estado='PROCESSANDO',atualizado_em=$5",
        [
          input.pedidoId,
          user,
          signature,
          input.texto,
          new Date(now),
          JSON.stringify(input.tarefaIds),
        ],
      );
      return { done: false, prefs, tasks, history, blocks };
    });
    if (prepared.done) return this.message(user, input.pedidoId);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        this.options.provider(
          {
            historico: prepared.history!,
            texto: input.texto,
            contexto: {
              preferencias: prepared.prefs,
              tarefas: prepared.tasks!.map(taskView),
              agenda: prepared.blocks!.map(blockView),
              horizonte: horizon(now, prepared.prefs!.fuso),
              agora: new Date(now).toISOString(),
            },
          },
          controller.signal,
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(
              new HttpError(
                503,
                "A IA demorou para responder. Tente novamente ou use o planejamento manual.",
              ),
            );
          }, this.options.timeoutMs ?? 30000);
        }),
      ]);
      const parsed = replySchema.safeParse(result);
      if (!parsed.success)
        throw new HttpError(
          503,
          "A IA não retornou uma resposta válida. Nada foi acrescentado ao planejamento.",
        );
      const reply = parsed.data;
      await transaction(this.db, async (cx) => {
        await this.lock(cx, user);
        const row = (
          await cx.query(
            "SELECT id FROM assistente_mensagens WHERE id=$1 AND usuario_id=$2 FOR UPDATE",
            [input.pedidoId, user],
          )
        ).rows[0];
        if (!row)
          throw new HttpError(
            409,
            "A conversa foi apagada enquanto a resposta era gerada.",
          );
        if (reply.proposta) {
          const allowed = new Set(prepared.tasks!.map((t) => t.id));
          const refs = new Set(reply.proposta.tarefas.map((t) => t.ref));
          if (
            reply.proposta.blocos.some(
              (b) =>
                b.tarefaRef &&
                !refs.has(b.tarefaRef) &&
                !allowed.has(b.tarefaRef),
            )
          )
            throw new HttpError(
              503,
              "A proposta citou uma tarefa que não foi selecionada.",
            );
          try {
            await this.validateProposal(cx, user, reply.proposta);
          } catch {
            throw new HttpError(
              503,
              "A IA sugeriu horários inválidos. Ajuste o pedido e tente novamente; nada foi acrescentado à agenda.",
            );
          }
          const unplanned = [
            ...prepared.tasks!.map((t) => ({
              ref: t.id,
              titulo: t.titulo,
              minutes: t.estimativa_min,
            })),
            ...reply.proposta.tarefas.map((t) => ({
              ref: t.ref,
              titulo: t.titulo,
              minutes: t.estimativaMin,
            })),
          ]
            .map((t) => {
              const reserved = reply
                .proposta!.blocos.filter(
                  (b) => b.tipo === "ESTUDO" && b.tarefaRef === t.ref,
                )
                .reduce(
                  (sum, b) =>
                    sum + (Date.parse(b.fim) - Date.parse(b.inicio)) / 60000,
                  0,
                );
              return { ...t, remaining: Math.max(0, t.minutes - reserved) };
            })
            .filter((t) => t.remaining > 0);
          if (unplanned.length)
            reply.texto +=
              "\n\nTempo ainda não reservado na proposta: " +
              unplanned
                .map((t) => `${t.titulo} (${t.remaining} min)`)
                .join("; ") +
              ". Revise sua disponibilidade e o restante das atividades. Se você dividiu uma tarefa em novas partes, revise também a tarefa original.";
          await cx.query(
            "INSERT INTO assistente_propostas(usuario_id,mensagem_id,dados) VALUES($1,$2,$3)",
            [user, input.pedidoId, JSON.stringify(reply.proposta)],
          );
        }
        await cx.query(
          "UPDATE assistente_mensagens SET resposta=$3,estado='CONCLUIDA',atualizado_em=$4 WHERE id=$1 AND usuario_id=$2",
          [input.pedidoId, user, reply.texto, new Date(this.options.clock())],
        );
      });
      return this.message(user, input.pedidoId);
    } catch (error) {
      await this.db.query(
        "UPDATE assistente_mensagens SET estado='FALHA',atualizado_em=$3 WHERE id=$1 AND usuario_id=$2 AND estado='PROCESSANDO'",
        [input.pedidoId, user, new Date(this.options.clock())],
      );
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        503,
        "Não foi possível obter a resposta da IA. Tente novamente.",
      );
    } finally {
      clearTimeout(timer!);
    }
  }
}
export function mountPlanning(
  app: Express,
  db: Database,
  options: PlanningOptions,
) {
  const service = new PlanningService(db, options);
  const route = (
    method: "get" | "post" | "put" | "delete",
    path: string,
    fn: (req: Request, user: number) => Promise<unknown>,
  ) =>
    app[method](path, (req, res, next) => {
      fn(req, res.locals.user.id)
        .then((data) => res.json(data))
        .catch(next);
    });
  route("get", "/planejamento/preferencias", (_, u) =>
    service.getPreferences(u),
  );
  route("put", "/planejamento/preferencias", (r, u) =>
    service.setPreferences(u, r.body),
  );
  route("get", "/tarefas", (_, u) => service.tasks(u));
  route("post", "/tarefas", (r, u) => service.createTask(u, r.body));
  route("put", "/tarefas/:id", (r, u) =>
    service.editTask(u, uuid.parse(r.params.id), r.body),
  );
  route("delete", "/tarefas/:id", (r, u) =>
    service.removeTask(u, uuid.parse(r.params.id)),
  );
  route("get", "/planejamentos", (_, u) => service.blocks(u));
  route("post", "/planejamentos", (r, u) => service.savePlan(u, r.body));
  route("put", "/planejamentos/:id", (r, u) =>
    service.editBlock(u, uuid.parse(r.params.id), r.body),
  );
  route("delete", "/planejamentos/:id", (r, u) =>
    service.removeBlock(u, uuid.parse(r.params.id)),
  );
  route("get", "/assistente/status", async (_, u) => ({
    configurado: !!options.provider,
  }));
  route("get", "/assistente/mensagens", (_, u) => service.history(u));
  route("post", "/assistente/mensagens", (r, u) => service.send(u, r.body));
  route("delete", "/assistente/mensagens", (_, u) => service.clearHistory(u));
  route("get", "/assistente/propostas/:id", (r, u) =>
    service.proposal(u, uuid.parse(r.params.id)),
  );
  route("put", "/assistente/propostas/:id", (r, u) =>
    service.editProposal(u, uuid.parse(r.params.id), r.body),
  );
  route("delete", "/assistente/propostas/:id", (r, u) =>
    service.discard(u, uuid.parse(r.params.id)),
  );
  route("post", "/assistente/propostas/:id/confirmar", (r, u) =>
    service.confirm(u, uuid.parse(r.params.id)),
  );
}
