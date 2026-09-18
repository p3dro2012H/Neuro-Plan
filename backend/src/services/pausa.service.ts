import { pool } from "../config/db";
import { AlertaFadigaPayload, RecomendacaoPausa } from "../types/alerta.types";

/**
 * Regra de negócio simples (evoluir com a equipe conforme o projeto avança):
 *
 *  - 1º alerta na sessão -> aviso leve, sem pausa obrigatória.
 *  - 2º ou 3º alerta -> sugerir pausa curta (5 min).
 *  - 4+ alertas na mesma sessão -> sugerir pausa longa (15 min),
 *    pois indica fadiga sustentada ("produtividade utópica").
 */
export async function processarAlerta(
  payload: AlertaFadigaPayload
): Promise<RecomendacaoPausa> {
  // 1. Persiste o alerta no banco
  await pool.query(
    `INSERT INTO alertas_fadiga (sessao_id, tipo, valor_metrica, criado_em)
     VALUES ($1, $2, $3, $4)`,
    [payload.sessionId, payload.tipo, payload.valorMetrica, payload.timestamp]
  );

  // 2. Conta quantos alertas essa sessão já acumulou
  const { rows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM alertas_fadiga
     WHERE sessao_id = $1`,
    [payload.sessionId]
  );
  const totalAlertas = Number(rows[0]?.total ?? 0);

  // 3. Aplica a regra de negócio
  if (totalAlertas >= 4) {
    return {
      deveDescansar: true,
      duracaoSugeridaMinutos: 15,
      motivo: "Fadiga sustentada detectada nesta sessão. Pausa longa recomendada.",
    };
  }

  if (totalAlertas >= 2) {
    return {
      deveDescansar: true,
      duracaoSugeridaMinutos: 5,
      motivo: "Sinais recorrentes de fadiga. Pausa curta recomendada.",
    };
  }

  return {
    deveDescansar: false,
    duracaoSugeridaMinutos: 0,
    motivo: "Primeiro sinal de fadiga registrado. Monitorando.",
  };
}
