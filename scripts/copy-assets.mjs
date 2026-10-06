import { cp, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "frontend/package.json"));
const entry = require.resolve("@mediapipe/tasks-vision");
const packageDir = path.dirname(entry);
await mkdir(path.join(root, "frontend/public/mediapipe"), { recursive: true });
await mkdir(path.join(root, "frontend/public/models"), { recursive: true });
await access(path.join(root, "visao-computacional/face_landmarker.task"));
await cp(
  path.join(packageDir, "wasm"),
  path.join(root, "frontend/public/mediapipe/wasm"),
  { recursive: true },
);
await cp(
  path.join(root, "visao-computacional/face_landmarker.task"),
  path.join(root, "frontend/public/models/face_landmarker.task"),
);
// MediaPipe carrega o runtime WASM por importScripts: precisa de worker clássico.
// Um bundle separado mantém esse comportamento igual em Vite dev e em produção.
await build({
  entryPoints: [path.join(root, "frontend/src/vision.worker.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  outfile: path.join(root, "frontend/public/mediapipe/vision-worker.js"),
});
console.log(
  "Modelo facial, WASM e worker clássico preparados para o frontend.",
);
