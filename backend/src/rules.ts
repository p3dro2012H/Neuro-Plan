export type RecommendationInput = {
  now: number;
  cycleStarted: number;
  deferredUntil: number | null;
  recentEvents: number;
  fatigue: number | null;
  paused: boolean;
};
export function recommend(
  input: RecommendationInput,
): { origem: string; motivo: string } | null {
  if (
    input.paused ||
    (input.deferredUntil !== null && input.now < input.deferredUntil)
  )
    return null;
  if (input.fatigue !== null && input.fatigue >= 4)
    return {
      origem: "AUTORRELATO",
      motivo: "Você informou cansaço elevado. Que tal uma pausa de 5 minutos?",
    };
  if (input.recentEvents >= 2)
    return {
      origem: "SINAIS",
      motivo:
        "Dois sinais de possível fadiga nos últimos 5 minutos. Que tal uma pausa?",
    };
  if (input.now - input.cycleStarted >= 25 * 60000)
    return {
      origem: "TEMPO",
      motivo:
        "Você completou 25 minutos de estudo contínuo. Que tal uma pausa?",
    };
  return null;
}
