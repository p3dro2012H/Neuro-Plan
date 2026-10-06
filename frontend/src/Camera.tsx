import { useEffect, useRef, useState } from "react";
import type { Signal } from "./types";
export function Camera({
  enabled,
  onSignal,
}: {
  enabled: boolean;
  onSignal: (signal: Signal) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const worker = useRef<Worker | null>(null);
  const [requested, setRequested] = useState(false),
    [analyzedFrames, setAnalyzedFrames] = useState(0),
    [background, setBackground] = useState(false),
    [status, setStatus] = useState("Câmera opcional"),
    [values, setValues] = useState<{ ear: number; mar: number } | null>(null);
  const enabledRef = useRef(enabled),
    callback = useRef(onSignal);
  callback.current = onSignal;
  enabledRef.current = enabled;
  useEffect(() => {
    worker.current?.postMessage({ type: "enabled", enabled });
    if (!enabled) {
      worker.current?.postMessage({ type: "reset" });
      setValues(null);
    }
  }, [enabled]);
  useEffect(() => {
    if (!requested) return;
    let cancelled = false,
      ready = false,
      inFlight = false,
      lastResult = 0,
      lastVideoTime = -1;
    let local: Worker | null = null;
    let processorTrack: MediaStreamTrack | null = null;
    let streamMode = false;
    let transport = "Preparando captura";
    const useTimer = () => {
      processorTrack?.stop();
      processorTrack = null;
      streamMode = false;
      transport = "Captura pelo temporizador do worker";
      setBackground(true);
      local?.postMessage({ type: "capture-timer" });
    };
    const visibility = () => {
      if (
        lastResult &&
        performance.now() - lastResult > 3000 &&
        enabledRef.current
      )
        setStatus(
          "Captura interrompida pelo navegador. Volte à aba ou reative a câmera.",
        );
    };
    document.addEventListener("visibilitychange", visibility);
    const heartbeat = setInterval(visibility, 1000);
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("A câmera exige HTTPS ou localhost.");
        setStatus("Solicitando acesso à câmera…");
        const capture = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          capture.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = capture;
        capture.getVideoTracks()[0].addEventListener("ended", () => {
          if (!cancelled) {
            setStatus("Câmera desconectada. Desative e tente novamente.");
            local?.terminate();
            setValues(null);
            ready = false;
          }
        });
        if (video.current) {
          video.current.srcObject = capture;
          await video.current.play();
        }
        if (cancelled) return;
        setStatus("Carregando modelo facial…");
        local = new Worker("/mediapipe/vision-worker.js");
        worker.current = local;
        local.onmessage = (event) => {
          if (cancelled) return;
          if (event.data.type === "ready") {
            ready = true;
            setStatus("Câmera pronta");
            local!.postMessage({
              type: "enabled",
              enabled: enabledRef.current,
            });
            const Processor = (
              window as unknown as {
                MediaStreamTrackProcessor?: new (options: {
                  track: MediaStreamTrack;
                }) => { readable: ReadableStream<VideoFrame> };
              }
            ).MediaStreamTrackProcessor;
            if (event.data.trackProcessor) {
              try {
                processorTrack = capture.getVideoTracks()[0].clone();
                local!.postMessage({ type: "track", track: processorTrack }, [
                  processorTrack as unknown as Transferable,
                ]);
                streamMode = true;
                transport = "Fluxo direto no worker";
                setBackground(true);
              } catch {
                useTimer();
              }
            } else if (Processor) {
              try {
                processorTrack = capture.getVideoTracks()[0].clone();
                const processor = new Processor({ track: processorTrack });
                local!.postMessage(
                  { type: "stream", stream: processor.readable },
                  [processor.readable],
                );
                streamMode = true;
                transport = "Fluxo transferido ao worker";
                setBackground(true);
              } catch {
                useTimer();
              }
            } else useTimer();
          }
          if (event.data.type === "capture") {
            void sendFrame();
          }
          if (event.data.type === "stream-error") {
            console.warn(
              "Falha no fluxo da câmera; usando captura alternativa",
              event.data.diagnostico,
            );
            useTimer();
          }
          if (event.data.type === "result") {
            inFlight = false;
            lastResult = performance.now();
            if (enabledRef.current) {
              setAnalyzedFrames((n) => n + 1);
              setValues(event.data.metrics);
              setStatus(
                `${event.data.metrics ? "Rosto detectado" : "Rosto não encontrado"} · ${transport}`,
              );
              if (event.data.signal) callback.current(event.data.signal);
            }
          }
          if (event.data.type === "error") {
            ready = false;
            inFlight = false;
            setValues(null);
            setStatus(event.data.message);
          }
        };
        local.onerror = () => {
          ready = false;
          inFlight = false;
          setStatus(
            "Modelo indisponível. Desative a câmera e tente novamente.",
          );
        };
        local.postMessage({ type: "init" });
        async function sendFrame() {
          if (cancelled) return;
          if (
            !ready ||
            inFlight ||
            !enabledRef.current ||
            streamMode ||
            !video.current ||
            video.current.readyState < 2
          )
            return;
          // Uma prévia congelada não representa novos quadros da webcam.
          if (video.current.currentTime === lastVideoTime) return;
          lastVideoTime = video.current.currentTime;
          inFlight = true;
          try {
            const image = await createImageBitmap(video.current);
            if (cancelled || !enabledRef.current) {
              image.close();
              inFlight = false;
              return;
            }
            local!.postMessage(
              { type: "frame", image, timestamp: performance.now() },
              [image],
            );
          } catch {
            inFlight = false;
            local?.postMessage({ type: "reset" });
          }
        }
      } catch (error) {
        if (!cancelled) {
          stream.current?.getTracks().forEach((t) => t.stop());
          stream.current = null;
          setStatus(
            error instanceof Error && error.message.includes("HTTPS")
              ? error.message
              : "Câmera indisponível ou permissão negada. Você pode estudar sem câmera.",
          );
        }
      }
    }
    void start();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", visibility);
      clearInterval(heartbeat);
      local?.postMessage({ type: "shutdown" });
      if (local) setTimeout(() => local?.terminate(), 100);
      try {
        processorTrack?.stop();
      } catch {
        /* track transferido ao worker */
      }
      worker.current = null;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
      if (video.current) video.current.srcObject = null;
    };
  }, [requested]);
  return (
    <section className="camera-panel" aria-label="Monitoramento por câmera">
      <div className="camera-heading">
        <h2>Seu espaço de estudo</h2>
        <span className="status-dot">
          {requested && !enabled ? "Análise suspensa" : status}
        </span>
      </div>
      <div className="camera-view">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Prévia local da câmera"
        />
        {!requested && (
          <div className="camera-placeholder">
            <span className="camera-symbol">◎</span>
            <h3>Estude no seu ritmo</h3>
            <p>
              A câmera pode ajudar a identificar sinais dos olhos e da boca.
            </p>
          </div>
        )}
      </div>
      <div className="camera-footer">
        {requested && (
          <p>
            Quadros analisados nesta ativação: {analyzedFrames}. O contador
            aumenta enquanto a captura está funcionando.
          </p>
        )}
        {requested && (
          <p>
            {background
              ? "A análise continua enquanto você usa outra aba ou programa. Mantenha esta aba aberta."
              : "Este navegador está usando análise somente em primeiro plano. Para análise em segundo plano, use Chrome ou Edge compatível."}
          </p>
        )}
        <p>
          {values
            ? `Olhos (EAR): ${values.ear.toFixed(2)} · Boca (MAR): ${values.mar.toFixed(2)}`
            : "As imagens ficam neste navegador. Não gravamos nem enviamos vídeo."}
        </p>
        <button
          className="secondary"
          onClick={() => {
            setRequested((r) => !r);
            setAnalyzedFrames(0);
            setBackground(false);
            setValues(null);
            setStatus("Câmera opcional");
          }}
          disabled={!enabled && !requested}
        >
          {requested ? "Desativar câmera" : "Ativar câmera"}
        </button>
      </div>
    </section>
  );
}
