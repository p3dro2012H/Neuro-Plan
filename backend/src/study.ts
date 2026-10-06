import { Connection, Database, HttpError, transaction } from "./database";
import { recommend } from "./rules";

export class StudyService {
  constructor(
    private db: Database,
    private clock: () => number = Date.now,
  ) {}
  private now() {
    return new Date(this.clock());
  }
  private async owned(cx: Connection, id: string, user: number, active = true) {
    const session = (
      await cx.query(
        "SELECT * FROM sessoes_estudo WHERE id=$1 AND usuario_id=$2 FOR UPDATE",
        [id, user],
      )
    ).rows[0];
    if (!session) throw new HttpError(404, "Sessão não encontrada.");
    if (active && session.finalizada_em)
      throw new HttpError(409, "Esta sessão já foi encerrada.");
    return session;
  }
  private async evaluate(cx: Connection, session: any) {
    const open = (
      await cx.query(
        "SELECT * FROM pausas WHERE sessao_id=$1 AND estado IN ('PENDENTE','EM_ANDAMENTO')",
        [session.id],
      )
    ).rows[0];
    if (open || session.finalizada_em) return;
    const now = this.now();
    const { rows } = await cx.query(
      `SELECT COUNT(*)::int AS total FROM alertas_fadiga
   WHERE sessao_id=$1 AND criado_em >= $2 AND criado_em >= $3 AND criado_em <= $4`,
      [
        session.id,
        session.ciclo_iniciado_em,
        new Date(now.getTime() - 300000),
        now,
      ],
    );
    const report = (
      await cx.query(
        "SELECT nivel FROM autorrelatos WHERE sessao_id=$1 AND criado_em >= $2 ORDER BY criado_em DESC, id DESC LIMIT 1",
        [session.id, session.ciclo_iniciado_em],
      )
    ).rows[0];
    const rec = recommend({
      now: now.getTime(),
      cycleStarted: new Date(session.ciclo_iniciado_em).getTime(),
      deferredUntil: session.adiada_ate
        ? new Date(session.adiada_ate).getTime()
        : null,
      recentEvents: rows[0].total,
      fatigue: report?.nivel ?? null,
      paused: false,
    });
    if (rec)
      await cx.query(
        `INSERT INTO pausas(sessao_id,duracao_sugerida_min,motivo,estado,origem,criado_em)
   VALUES($1,5,$2,'PENDENTE',$3,$4)`,
        [session.id, rec.motivo, rec.origem, now],
      );
  }
  private async snapshot(cx: Connection, session: any) {
    const pauses = (
      await cx.query(
        "SELECT * FROM pausas WHERE sessao_id=$1 ORDER BY criado_em, id",
        [session.id],
      )
    ).rows;
    const events = (
      await cx.query(
        "SELECT id,evento_id,tipo,valor_metrica,criado_em FROM alertas_fadiga WHERE sessao_id=$1 ORDER BY criado_em DESC LIMIT 200",
        [session.id],
      )
    ).rows;
    const total = (
      await cx.query(
        "SELECT COUNT(*)::int AS total FROM alertas_fadiga WHERE sessao_id=$1",
        [session.id],
      )
    ).rows[0].total;
    const reports = (
      await cx.query(
        "SELECT nivel,momento,criado_em FROM autorrelatos WHERE sessao_id=$1 ORDER BY criado_em,id",
        [session.id],
      )
    ).rows;
    const now = this.now();
    const end = session.finalizada_em
      ? new Date(session.finalizada_em).getTime()
      : now.getTime();
    const pauseMs = pauses.reduce(
      (sum: number, p: any) =>
        sum +
        (p.iniciada_em
          ? Math.max(
              0,
              (p.finalizada_em ? new Date(p.finalizada_em).getTime() : end) -
                new Date(p.iniciada_em).getTime(),
            )
          : 0),
      0,
    );
    const elapsed = Math.max(0, end - new Date(session.iniciada_em).getTime());
    const open =
      pauses.find(
        (p: any) => p.estado === "EM_ANDAMENTO" || p.estado === "PENDENTE",
      ) ?? null;
    return {
      ...session,
      agora: now.toISOString(),
      pausas: pauses,
      alertas: events,
      autorrelatos: reports,
      recomendacao: open,
      resumo: {
        estudoSegundos: Math.floor(Math.max(0, elapsed - pauseMs) / 1000),
        pausaSegundos: Math.floor(pauseMs / 1000),
        totalAlertas: total,
        aceitas: pauses.filter(
          (p: any) => p.aceita_pelo_usuario === true && p.origem !== "MANUAL",
        ).length,
        adiadas: pauses.filter((p: any) => p.estado === "ADIADA").length,
      },
    };
  }
  async start(user: number, materia: string, nivel: number) {
    return transaction(this.db, async (cx) => {
      // Serializa inícios concorrentes do mesmo usuário, inclusive antes da primeira sessão existir.
      await cx.query("SELECT id FROM usuarios WHERE id=$1 FOR UPDATE", [user]);
      if (
        (
          await cx.query(
            "SELECT id FROM sessoes_estudo WHERE usuario_id=$1 AND finalizada_em IS NULL",
            [user],
          )
        ).rows.length
      )
        throw new HttpError(409, "Você já tem uma sessão ativa.");
      const now = this.now();
      const session = (
        await cx.query(
          `INSERT INTO sessoes_estudo(usuario_id,materia,iniciada_em,ciclo_iniciado_em)
    VALUES($1,$2,$3,$3) RETURNING *`,
          [user, materia, now],
        )
      ).rows[0];
      await cx.query(
        "INSERT INTO autorrelatos(sessao_id,nivel,momento,criado_em) VALUES($1,$2,'INICIO',$3)",
        [session.id, nivel, now],
      );
      await this.evaluate(cx, session);
      return this.snapshot(cx, session);
    });
  }
  async get(user: number, id: string, evaluate = false) {
    return transaction(this.db, async (cx) => {
      const s = await this.owned(cx, id, user, false);
      if (evaluate) await this.evaluate(cx, s);
      return this.snapshot(cx, s);
    });
  }
  async list(user: number, offset: number) {
    return (
      await this.db.query(
        `SELECT s.*, (SELECT COUNT(*)::int FROM alertas_fadiga a WHERE a.sessao_id=s.id) AS total_alertas
   FROM sessoes_estudo s WHERE usuario_id=$1 ORDER BY iniciada_em DESC,id LIMIT 20 OFFSET $2`,
        [user, offset],
      )
    ).rows;
  }
  async active(user: number) {
    const row = (
      await this.db.query(
        "SELECT id FROM sessoes_estudo WHERE usuario_id=$1 AND finalizada_em IS NULL",
        [user],
      )
    ).rows[0];
    return row ? this.get(user, row.id) : null;
  }
  async report(user: number, id: string, nivel: number) {
    return transaction(this.db, async (cx) => {
      const s = await this.owned(cx, id, user);
      await cx.query(
        "INSERT INTO autorrelatos(sessao_id,nivel,momento,criado_em) VALUES($1,$2,'DURANTE',$3)",
        [id, nivel, this.now()],
      );
      await this.evaluate(cx, s);
      return this.snapshot(cx, s);
    });
  }
  async alert(
    user: number,
    payload: {
      sessionId: string;
      eventoId: string;
      tipo: string;
      valorMetrica: number;
      timestamp: string;
    },
  ) {
    return transaction(this.db, async (cx) => {
      const s = await this.owned(cx, payload.sessionId, user);
      const old = (
        await cx.query("SELECT * FROM alertas_fadiga WHERE evento_id=$1", [
          payload.eventoId,
        ])
      ).rows[0];
      if (old) {
        if (
          old.sessao_id !== s.id ||
          old.tipo !== payload.tipo ||
          Number(old.valor_metrica) !==
            Number(payload.valorMetrica.toFixed(3)) ||
          new Date(old.criado_em).getTime() !==
            new Date(payload.timestamp).getTime()
        )
          throw new HttpError(
            409,
            "Identificador já utilizado por outro evento.",
          );
        return { ...(await this.snapshot(cx, s)), duplicado: true };
      }
      const now = this.now();
      const timestamp = new Date(payload.timestamp);
      if (
        timestamp.getTime() > now.getTime() + 10000 ||
        timestamp.getTime() < now.getTime() - 60000 ||
        timestamp < new Date(s.ciclo_iniciado_em)
      )
        throw new HttpError(
          400,
          "Horário do evento fora do ciclo atual ou distante do servidor.",
        );
      if (
        (
          await cx.query(
            "SELECT id FROM pausas WHERE sessao_id=$1 AND estado='EM_ANDAMENTO'",
            [s.id],
          )
        ).rows.length
      )
        throw new HttpError(409, "Detecção suspensa durante a pausa.");
      const last = (
        await cx.query(
          "SELECT criado_em FROM alertas_fadiga WHERE sessao_id=$1 ORDER BY criado_em DESC LIMIT 1",
          [s.id],
        )
      ).rows[0];
      if (
        last &&
        timestamp.getTime() - new Date(last.criado_em).getTime() < 30000
      )
        throw new HttpError(429, "Aguarde 30 segundos entre sinais.");
      await cx.query(
        "INSERT INTO alertas_fadiga(sessao_id,tipo,valor_metrica,criado_em,evento_id) VALUES($1,$2,$3,$4,$5)",
        [s.id, payload.tipo, payload.valorMetrica, timestamp, payload.eventoId],
      );
      await this.evaluate(cx, s);
      return { ...(await this.snapshot(cx, s)), duplicado: false };
    });
  }
  async pause(
    user: number,
    id: string,
    action: "aceitar" | "adiar" | "manual" | "concluir",
    pauseId?: number,
  ) {
    return transaction(this.db, async (cx) => {
      let s = await this.owned(cx, id, user);
      const now = this.now();
      let p = (
        await cx.query(
          "SELECT * FROM pausas WHERE sessao_id=$1 AND estado IN ('PENDENTE','EM_ANDAMENTO')",
          [id],
        )
      ).rows[0];
      if (action === "manual") {
        if (p?.estado === "EM_ANDAMENTO") return this.snapshot(cx, s);
        if (p)
          await cx.query(
            "UPDATE pausas SET estado='CANCELADA',decidida_em=$2 WHERE id=$1",
            [p.id, now],
          );
        await cx.query(
          `INSERT INTO pausas(sessao_id,duracao_sugerida_min,motivo,estado,origem,aceita_pelo_usuario,iniciada_em,decidida_em,criado_em)
     VALUES($1,5,'Pausa iniciada pelo estudante.','EM_ANDAMENTO','MANUAL',true,$2,$2,$2)`,
          [id, now],
        );
        s = (
          await cx.query(
            "UPDATE sessoes_estudo SET adiada_ate=NULL WHERE id=$1 RETURNING *",
            [id],
          )
        ).rows[0];
      } else {
        if (!p || p.id !== pauseId)
          throw new HttpError(409, "A recomendação mudou. Atualize a sessão.");
        if (action === "aceitar" && p.estado === "EM_ANDAMENTO")
          return this.snapshot(cx, s);
        if (action === "concluir") {
          if (p.estado !== "EM_ANDAMENTO")
            throw new HttpError(409, "Não há pausa em andamento.");
          await cx.query(
            "UPDATE pausas SET estado='CONCLUIDA',finalizada_em=$2 WHERE id=$1",
            [p.id, now],
          );
          s = (
            await cx.query(
              "UPDATE sessoes_estudo SET ciclo_iniciado_em=$2,adiada_ate=NULL WHERE id=$1 RETURNING *",
              [id, now],
            )
          ).rows[0];
        } else {
          if (p.estado !== "PENDENTE")
            throw new HttpError(409, "Esta pausa já começou.");
          if (action === "aceitar")
            await cx.query(
              "UPDATE pausas SET estado='EM_ANDAMENTO',aceita_pelo_usuario=true,iniciada_em=$2,decidida_em=$2 WHERE id=$1",
              [p.id, now],
            );
          else {
            await cx.query(
              "UPDATE pausas SET estado='ADIADA',aceita_pelo_usuario=false,decidida_em=$2 WHERE id=$1",
              [p.id, now],
            );
            s = (
              await cx.query(
                "UPDATE sessoes_estudo SET adiada_ate=$2 WHERE id=$1 RETURNING *",
                [id, new Date(now.getTime() + 300000)],
              )
            ).rows[0];
          }
        }
      }
      return this.snapshot(cx, s);
    });
  }
  async finish(user: number, id: string, nivel: number) {
    return transaction(this.db, async (cx) => {
      let s = await this.owned(cx, id, user, false);
      if (s.finalizada_em) return this.snapshot(cx, s);
      const now = this.now();
      await cx.query(
        "UPDATE pausas SET estado=CASE WHEN estado='EM_ANDAMENTO' THEN 'CONCLUIDA' ELSE 'CANCELADA' END, finalizada_em=CASE WHEN iniciada_em IS NOT NULL THEN $2::timestamptz ELSE NULL END WHERE sessao_id=$1 AND estado IN ('PENDENTE','EM_ANDAMENTO')",
        [id, now],
      );
      await cx.query(
        "INSERT INTO autorrelatos(sessao_id,nivel,momento,criado_em) VALUES($1,$2,'FIM',$3)",
        [id, nivel, now],
      );
      s = (
        await cx.query(
          "UPDATE sessoes_estudo SET finalizada_em=$2 WHERE id=$1 RETURNING *",
          [id, now],
        )
      ).rows[0];
      return this.snapshot(cx, s);
    });
  }
}
