import { useEffect, useRef, useState } from "react";
import type { StudySession } from "./types";
import {
  notificationKey,
  shouldNotify,
  shouldCloseNotification,
} from "./notification-policy";

export function Notifications({
  userId,
  session,
  offline,
  showControls,
  onReturn,
}: {
  userId: number | null;
  session: StudySession | null;
  offline: boolean;
  showControls: boolean;
  onReturn: () => void;
}) {
  const supported =
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    window.isSecureContext;
  const [permission, setPermission] = useState(
    supported ? Notification.permission : "denied",
  );
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const latest = useRef({ userId, session, offline, onReturn });
  latest.current = { userId, session, offline, onReturn };
  const running = useRef(false);
  const sent = useRef(new Set<string>());

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    async function sync() {
      if (cancelled || running.current) return;
      setPermission(Notification.permission);
      running.current = true;
      try {
        const registration = await navigator.serviceWorker.register(
          "/notifications-sw.js",
          { scope: "/" },
        );
        await navigator.serviceWorker.ready;
        if (cancelled) return;
        const state = latest.current;
        if (state.offline && state.userId) return;
        const key =
          state.userId === null
            ? null
            : notificationKey(state.userId, state.session);
        const tag = key ? `neuroplan:${key}` : null;
        for (const notification of await registration.getNotifications()) {
          if (shouldCloseNotification(notification.tag, tag))
            notification.close();
        }
        if (!key) return;
        let alreadySent = sent.current.has(key);
        try {
          alreadySent ||=
            localStorage.getItem(`neuroplan-notification:${key}`) === "sent";
        } catch {
          /* armazenamento opcional */
        }
        if (
          !shouldNotify({
            key,
            permission: Notification.permission,
            offline: state.offline,
            alreadySent,
          })
        )
          return;
        // O estado pode mudar enquanto o service worker inicia.
        if (
          cancelled ||
          latest.current.offline ||
          latest.current.userId !== state.userId ||
          notificationKey(state.userId!, latest.current.session) !== key
        )
          return;
        await registration.showNotification("Hora de uma pausa?", {
          body: "O NeuroPlan sugere uma pausa de 5 minutos. Clique para revisar.",
          tag: tag!,
        });
        if (
          cancelled ||
          latest.current.offline ||
          latest.current.userId !== state.userId ||
          notificationKey(state.userId!, latest.current.session) !== key
        ) {
          for (const notification of await registration.getNotifications({
            tag: tag!,
          }))
            notification.close();
          return;
        }
        sent.current.add(key);
        try {
          localStorage.setItem(`neuroplan-notification:${key}`, "sent");
        } catch {
          /* mantém deduplicação em memória */
        }
      } catch {
        if (!cancelled)
          setMessage(
            "Não foi possível exibir notificações. As recomendações continuam disponíveis aqui.",
          );
      } finally {
        running.current = false;
      }
    }
    const received = (event: MessageEvent) => {
      if (event.data?.type === "review-recommendation")
        latest.current.onReturn();
    };
    navigator.serviceWorker.addEventListener("message", received);
    document.addEventListener("visibilitychange", sync);
    document.addEventListener("neuroplan-notification-sync", sync);
    const interval = setInterval(sync, 15000);
    void sync();
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener("neuroplan-notification-sync", sync);
      navigator.serviceWorker.removeEventListener("message", received);
      void navigator.serviceWorker
        .getRegistration("/")
        .then(async (registration) => {
          for (const notification of (await registration?.getNotifications()) ??
            []) {
            if (notification.tag.startsWith("neuroplan:")) notification.close();
          }
        })
        .catch(() => {});
    };
  }, [supported]);

  // Atualizações confirmadas pela API devem ser observadas sem esperar o próximo timer.
  useEffect(() => {
    document.dispatchEvent(new Event("neuroplan-notification-sync"));
  }, [userId, session, offline]);

  async function activate(test: boolean) {
    setWorking(true);
    try {
      const result = test
        ? Notification.permission
        : await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setMessage(
          "Permita notificações nas configurações deste site no navegador. Você pode continuar usando o NeuroPlan.",
        );
        return;
      }
      const registration = await navigator.serviceWorker.register(
        "/notifications-sw.js",
        { scope: "/" },
      );
      await navigator.serviceWorker.ready;
      if (test)
        await registration.showNotification("NeuroPlan · Teste", {
          body: "As notificações estão habilitadas. Clique para voltar ao NeuroPlan.",
          tag: "neuroplan:test",
        });
      setMessage(
        test
          ? "Teste enviado. Confira as notificações do Windows."
          : "Notificações ativadas. Mantenha esta aba aberta e o computador acordado.",
      );
      document.dispatchEvent(new Event("neuroplan-notification-sync"));
    } catch {
      setMessage(
        "Não foi possível ativar notificações. Verifique as permissões do navegador.",
      );
    } finally {
      setWorking(false);
    }
  }

  if (userId === null || !showControls) return null;
  return (
    <section className="surface" aria-label="Notificações de pausa">
      <h2>Avisos durante o estudo</h2>
      <p>
        Use outra aba ou programa enquanto estuda. Mantenha o NeuroPlan aberto
        para receber sugestões de pausa.
      </p>
      <p>
        Uma detecção isolada gera um aviso na sessão. As notificações são
        enviadas quando o sistema recomenda uma pausa, também com esta aba
        visível.
      </p>
      {!supported ? (
        <p>Notificações exigem Chrome ou Edge em HTTPS ou localhost.</p>
      ) : (
        <>
          <button
            className="secondary"
            disabled={working}
            onClick={() => void activate(permission === "granted")}
          >
            {permission === "granted"
              ? "Testar notificação"
              : "Ativar notificações"}
          </button>
          <p>
            Permissão do navegador:{" "}
            {permission === "granted"
              ? "permitida"
              : permission === "denied"
                ? "bloqueada"
                : "ainda não solicitada"}
            .
          </p>
          {permission === "denied" && (
            <p>
              Notificações bloqueadas. Habilite a permissão nas configurações
              deste site.
            </p>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      <p>
        O navegador pode atrasar avisos; o modo Não perturbe do Windows pode
        ocultá-los.
      </p>
    </section>
  );
}
