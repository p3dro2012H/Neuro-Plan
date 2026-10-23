export type Task = {
  id?: string;
  titulo: string;
  materia: string;
  prazo: string | null;
  estimativaMin: number;
  prioridade: "BAIXA" | "MEDIA" | "ALTA";
  concluida: boolean;
};
export type Block = {
  id?: string;
  titulo: string;
  materia: string;
  tipo: "ESTUDO" | "PAUSA" | "PESSOAL";
  inicio: string;
  fim: string;
  tarefaRef: string | null;
};
export type Preferences = {
  fuso: string;
  disponibilidade: { dia: number; inicio: string; fim: string }[];
  compromissos: { titulo: string; inicio: string; fim: string }[];
};
export type Proposal = {
  tarefas: (Omit<Task, "id" | "concluida"> & { ref: string })[];
  blocos: Block[];
};
export type Message = {
  id: string;
  texto: string;
  tarefa_ids: string[];
  resposta: string | null;
  estado: string;
  proposta_id: string | null;
  proposta: Proposal | null;
  proposta_estado: string | null;
};
export const emptyTask = (): Task => ({
  titulo: "",
  materia: "",
  prazo: null,
  estimativaMin: 25,
  prioridade: "MEDIA",
  concluida: false,
});
export const taskBody = ({ id, ...task }: Task) => {
  void id;
  return task;
};
