export type User = { id: number; nome: string; email: string };
export type Pause = {
  id: number;
  estado: "PENDENTE" | "ADIADA" | "EM_ANDAMENTO" | "CONCLUIDA" | "CANCELADA";
  origem: string;
  motivo: string;
  iniciada_em: string | null;
  finalizada_em: string | null;
  duracao_sugerida_min: number;
  aceita_pelo_usuario: boolean | null;
};
export type StudySession = {
  id: string;
  materia: string;
  iniciada_em: string;
  finalizada_em: string | null;
  ciclo_iniciado_em: string;
  adiada_ate: string | null;
  agora: string;
  recomendacao: Pause | null;
  pausas: Pause[];
  alertas: {
    evento_id: string;
    tipo: string;
    criado_em: string;
    valor_metrica: number;
  }[];
  autorrelatos: { nivel: number; momento: string; criado_em: string }[];
  resumo: {
    estudoSegundos: number;
    pausaSegundos: number;
    totalAlertas: number;
    aceitas: number;
    adiadas: number;
  };
};
export type HistoryItem = {
  id: string;
  materia: string;
  iniciada_em: string;
  finalizada_em: string | null;
  total_alertas: number;
};
export type Signal = {
  tipo: "OLHOS_FECHADOS" | "BOCEJO";
  valorMetrica: number;
};
