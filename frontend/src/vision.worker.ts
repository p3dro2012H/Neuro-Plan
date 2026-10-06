import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { metrics, SignalDetector } from "./detection";
import { FrameContinuity } from "./notification-policy";
let landmarker: FaceLandmarker | null = null;
const detector = new SignalDetector();
const continuity = new FrameContinuity();
let enabled = true;
let reader: ReadableStreamDefaultReader<VideoFrame> | null = null;
let captureTimer: ReturnType<typeof setInterval> | null = null;
let ownedTrack: MediaStreamTrack | null = null;
function stopCaptureTimer() {
  if (captureTimer !== null) clearInterval(captureTimer);
  captureTimer = null;
}
function analyze(image: ImageBitmap, timestamp: number) {
  if (!landmarker) throw new Error("Modelo não carregado");
  if (continuity.interrupted(timestamp)) detector.reset();
  const result = landmarker.detectForVideo(image, timestamp);
  const values = result.faceLandmarks[0]
    ? metrics(result.faceLandmarks[0], image.width, image.height)
    : null;
  scope.postMessage({
    type: "result",
    metrics: values,
    signal: detector.update(values, timestamp),
  });
}
async function consume(stream: ReadableStream<VideoFrame>) {
  reader = stream.getReader();
  let last = -Infinity;
  try {
    while (true) {
      const { value: frame, done } = await reader.read();
      if (done) break;
      try {
        const timestamp = performance.now();
        if (!enabled || timestamp - last < 100) continue;
        last = timestamp;
        const image = await createImageBitmap(frame);
        try {
          if (enabled) analyze(image, timestamp);
        } finally {
          image.close();
        }
      } finally {
        frame.close();
      }
    }
    scope.postMessage({
      type: "stream-error",
      message: "Fluxo da câmera interrompido. Desative e tente novamente.",
    });
  } catch (error) {
    scope.postMessage({
      type: "stream-error",
      diagnostico: error instanceof Error ? error.message : String(error),
      message:
        "Análise em segundo plano indisponível. Desative a câmera e tente novamente.",
    });
  } finally {
    reader?.releaseLock();
    reader = null;
  }
}
const scope = self as unknown as {
  postMessage: (data: unknown) => void;
  onmessage: ((event: MessageEvent) => void) | null;
  location: Location;
};
scope.onmessage = async (event: MessageEvent) => {
  const data = event.data;
  try {
    if (data.type === "init") {
      const files = await FilesetResolver.forVisionTasks(
        new URL("/mediapipe/wasm", scope.location.origin).href,
      );
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: new URL(
            "/models/face_landmarker.task",
            scope.location.origin,
          ).href,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
      });
      scope.postMessage({
        type: "ready",
        trackProcessor: "MediaStreamTrackProcessor" in self,
      });
    } else if (data.type === "reset") {
      detector.reset();
      continuity.reset();
    } else if (data.type === "enabled") {
      enabled = data.enabled;
      detector.reset();
      continuity.reset();
    } else if (data.type === "stream") {
      stopCaptureTimer();
      void consume(data.stream);
    } else if (data.type === "track") {
      try {
        ownedTrack = data.track;
        const Processor = (
          self as unknown as {
            MediaStreamTrackProcessor: new (options: {
              track: MediaStreamTrack;
            }) => { readable: ReadableStream<VideoFrame> };
          }
        ).MediaStreamTrackProcessor;
        const processor = new Processor({ track: data.track });
        stopCaptureTimer();
        void consume(processor.readable);
      } catch (error) {
        data.track?.stop();
        scope.postMessage({
          type: "stream-error",
          diagnostico: error instanceof Error ? error.message : String(error),
        });
      }
    } else if (data.type === "capture-timer") {
      stopCaptureTimer();
      captureTimer = setInterval(() => {
        if (enabled) scope.postMessage({ type: "capture" });
      }, 100);
    } else if (data.type === "shutdown") {
      enabled = false;
      stopCaptureTimer();
      ownedTrack?.stop();
      void reader?.cancel().catch(() => {});
      self.close();
    } else if (data.type === "frame") {
      const image = data.image as ImageBitmap;
      try {
        if (enabled) analyze(image, data.timestamp);
      } finally {
        image.close();
      }
    }
  } catch (error) {
    console.error("Falha no detector facial:", error);
    scope.postMessage({
      type: "error",
      diagnostico: error instanceof Error ? error.message : String(error),
      message:
        "Não foi possível analisar a câmera. Continue com o temporizador ou tente novamente.",
    });
  }
};
