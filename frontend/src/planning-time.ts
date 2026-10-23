export function zonedInput(instant: string, zone: string): string {
  if (!instant) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
export function fromZonedInput(value: string, zone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Informe uma data e um horário válidos.");
  const target = Date.parse(value + "Z");
  let result = target;
  for (let i = 0; i < 4; i++)
    result +=
      target -
      Date.parse(zonedInput(new Date(result).toISOString(), zone) + "Z");
  if (zonedInput(new Date(result).toISOString(), zone) !== value)
    throw new Error(
      "Este horário não existe no fuso escolhido, devido à mudança de horário. Escolha outro horário.",
    );
  return new Date(result).toISOString();
}
export const planningDate = (instant: string, zone: string) =>
  new Date(instant).toLocaleString("pt-BR", {
    timeZone: zone,
    dateStyle: "short",
    timeStyle: "short",
  });
