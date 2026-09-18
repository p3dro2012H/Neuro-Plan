export type TipoAlerta = "OLHOS_FECHADOS" | "BOCEJO";

export interface AlertaFadigaPayload {
  sessionId: string;
  tipo: TipoAlerta;
  valorMetrica: number;
  timestamp: string;
}

export interface RecomendacaoPausa {
  deveDescansar: boolean;
  duracaoSugeridaMinutos: number;
  motivo: string;
}
