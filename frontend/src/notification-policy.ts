import type { StudySession } from "./types";

export function notificationKey(userId: number, session: StudySession | null) {
  if (
    !session ||
    session.finalizada_em ||
    session.recomendacao?.estado !== "PENDENTE"
  )
    return null;
  return `${userId}:${session.id}:${session.recomendacao.id}:${session.adiada_ate ?? "inicio"}`;
}

export function shouldNotify(options: {
  key: string | null;
  permission: string;
  offline: boolean;
  alreadySent: boolean;
}) {
  return (
    !!options.key &&
    options.permission === "granted" &&
    !options.offline &&
    !options.alreadySent
  );
}

export function shouldCloseNotification(
  tag: string,
  currentTag: string | null,
) {
  return (
    tag.startsWith("neuroplan:") &&
    tag !== "neuroplan:test" &&
    tag !== currentTag
  );
}

export class FrameContinuity {
  private previous: number | null = null;
  interrupted(now: number) {
    const interrupted =
      this.previous !== null &&
      (now - this.previous > 500 || now <= this.previous);
    this.previous = now;
    return interrupted;
  }
  reset() {
    this.previous = null;
  }
}
