import { z } from "zod";
import { HttpError } from "./database";
const text = z.string().trim().min(1).max(150);
const instant = z.iso.datetime({ offset: true });
const hour = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const taskSchema = z
  .object({
    titulo: text,
    materia: z.string().trim().max(150).default(""),
    prazo: instant.nullable().default(null),
    estimativaMin: z.number().int().min(1).max(1440),
    prioridade: z.enum(["BAIXA", "MEDIA", "ALTA"]),
    concluida: z.boolean().default(false),
  })
  .strict();
export const blockSchema = z
  .object({
    titulo: text,
    materia: z.string().trim().max(150).default(""),
    tipo: z.enum(["ESTUDO", "PAUSA", "PESSOAL"]),
    inicio: instant,
    fim: instant,
    tarefaRef: z.string().min(1).max(80).nullable().default(null),
  })
  .strict();
export const preferencesSchema = z
  .object({
    fuso: z
      .string()
      .max(80)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("pt-BR", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, "Fuso inválido"),
    disponibilidade: z
      .array(
        z
          .object({
            dia: z.number().int().min(0).max(6),
            inicio: hour,
            fim: hour,
          })
          .strict()
          .refine(
            (v) => v.fim > v.inicio,
            "O fim deve ser posterior ao início",
          ),
      )
      .max(28),
    compromissos: z
      .array(
        z
          .object({ titulo: text, inicio: instant, fim: instant })
          .strict()
          .refine(
            (v) => Date.parse(v.fim) > Date.parse(v.inicio),
            "Compromisso com duração inválida",
          ),
      )
      .max(30),
  })
  .strict();
export const proposalSchema = z
  .object({
    tarefas: z
      .array(
        taskSchema
          .omit({ concluida: true })
          .extend({ ref: z.string().min(1).max(80) }),
      )
      .max(30),
    blocos: z.array(blockSchema).max(56),
  })
  .strict();
export const replySchema = z
  .object({
    texto: z.string().trim().min(1).max(6000),
    proposta: proposalSchema.nullable(),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export type Proposal = z.infer<typeof proposalSchema>;
export type Reply = z.infer<typeof replySchema>;
export function localParts(iso: string | number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: `${get("hour")}:${get("minute")}`,
  };
}
export function horizon(now: number, zone: string) {
  const first = localParts(now, zone).date;
  const last = new Date(Date.parse(`${first}T12:00:00Z`) + 6 * 86400000)
    .toISOString()
    .slice(0, 10);
  return { first, last };
}
export function validateBlocks(
  blocks: Proposal["blocos"],
  preferences: Preferences,
  existing: any[],
  now: number,
) {
  const { first, last } = horizon(now, preferences.fuso);
  const all = [
    ...existing.map((b) => ({
      inicio: new Date(b.inicio).toISOString(),
      fim: new Date(b.fim).toISOString(),
    })),
    ...blocks,
  ];
  for (const b of blocks) {
    const start = Date.parse(b.inicio),
      end = Date.parse(b.fim);
    const s = localParts(b.inicio, preferences.fuso),
      e = localParts(b.fim, preferences.fuso);
    if (
      start < now ||
      start % 60000 !== 0 ||
      end % 60000 !== 0 ||
      end <= start ||
      (end - start) % 60000 !== 0 ||
      s.date < first ||
      s.date > last ||
      s.date !== e.date
    )
      throw new HttpError(
        400,
        "Os blocos devem ter duração positiva em minutos e ocorrer nos próximos sete dias, sem atravessar a meia-noite.",
      );
    const day = new Date(`${s.date}T12:00:00Z`).getUTCDay();
    if (
      !preferences.disponibilidade.some(
        (v) => v.dia === day && v.inicio <= s.hour && v.fim >= e.hour,
      )
    )
      throw new HttpError(
        400,
        "Um bloco está fora dos horários disponíveis. Ajuste a disponibilidade ou o bloco.",
      );
    if (
      preferences.compromissos.some(
        (v) => start < Date.parse(v.fim) && end > Date.parse(v.inicio),
      )
    )
      throw new HttpError(400, "Um bloco coincide com um compromisso fixo.");
  }
  all.sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  for (let i = 1; i < all.length; i++)
    if (Date.parse(all[i].inicio) < Date.parse(all[i - 1].fim))
      throw new HttpError(400, "Há conflito entre horários da agenda.");
}
