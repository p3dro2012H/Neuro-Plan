import { useEffect, useState } from "react";

// A solicitação deve partir de um clique; o navegador mantém o controle da permissão.
export function NotificationPermissionPrompt() {
  const supported =
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    window.isSecureContext;
  const [permission, setPermission] = useState(
    supported ? Notification.permission : "denied",
  );
  const [dismissed, setDismissed] = useState(() => {
    try {
      return (
        sessionStorage.getItem("neuroplan-notification-prompt") === "dismissed"
      );
    } catch {
      return false;
    }
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supported) return;
    const update = () => setPermission(Notification.permission);
    window.addEventListener("focus", update);
    document.addEventListener("neuroplan-notification-sync", update);
    return () => {
      window.removeEventListener("focus", update);
      document.removeEventListener("neuroplan-notification-sync", update);
    };
  }, [supported]);

  async function activate() {
    setBusy(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      document.dispatchEvent(new Event("neuroplan-notification-sync"));
      if (result === "default")
        setMessage(
          "Escolha Permitir na confirmação do navegador para receber avisos de pausa.",
        );
    } catch {
      setMessage(
        "Não foi possível solicitar a permissão. Confira as configurações de notificações deste site.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!supported || permission === "granted" || dismissed) return null;
  return (
    <aside
      className="notification-permission-banner"
      aria-label="Ativar avisos de pausa"
    >
      <div>
        <strong>Receba avisos de pausa enquanto estuda</strong>
        <p>
          {permission === "denied"
            ? "As notificações estão bloqueadas. Abra as permissões deste site no navegador e permita as notificações."
            : "Ative as notificações e escolha Permitir na confirmação do navegador. Você poderá estudar em outra aba ou programa com o NeuroPlan aberto."}
        </p>
        {message && <p role="status">{message}</p>}
      </div>
      <div className="permission-actions">
        {permission !== "denied" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void activate()}
          >
            {busy ? "Aguardando permissão…" : "Ativar notificações"}
          </button>
        )}
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setDismissed(true);
            try {
              sessionStorage.setItem(
                "neuroplan-notification-prompt",
                "dismissed",
              );
            } catch {
              /* opcional */
            }
          }}
        >
          Agora não
        </button>
      </div>
    </aside>
  );
}
