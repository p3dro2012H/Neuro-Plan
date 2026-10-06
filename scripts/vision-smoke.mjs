// Teste do worker real com imagem vazia, sem solicitar acesso à webcam.
import { access, writeFile } from "node:fs/promises";
import path from "node:path";
const dist = path.resolve(import.meta.dirname, "../frontend/dist");
await access(path.join(dist, "mediapipe/vision-worker.js"));
const html = `<!doctype html><html lang="pt-BR"><meta charset="UTF-8"><title>Teste do worker facial</title><h1>Teste do worker facial</h1><p id="result">Carregando o modelo local…</p><script type="module" src="/vision-smoke.js"></script></html>`;
const script = `
const result=document.getElementById('result');
const worker=new Worker('/mediapipe/vision-worker.js');
const timer=setTimeout(()=>{result.textContent='FALHA: o worker não concluiu em 30 segundos.';worker.terminate();},30000);
worker.onerror=event=>{clearTimeout(timer);result.textContent='FALHA: '+event.message;};
worker.onmessage=async event=>{
 if(event.data.type==='ready'){
  const canvas=new OffscreenCanvas(640,480);canvas.getContext('2d').fillRect(0,0,640,480);
  const image=await createImageBitmap(canvas);worker.postMessage({type:'frame',image,timestamp:performance.now()},[image]);
 }
 if(event.data.type==='result'){
  clearTimeout(timer);result.textContent=event.data.metrics===null&&event.data.signal===null?'PASSOU: modelo e WASM locais carregados; imagem sem rosto não emite sinal.':'FALHA: imagem vazia gerou sinal.';worker.terminate();
 }
 if(event.data.type==='error'){clearTimeout(timer);result.textContent='FALHA: '+(event.data.diagnostico??event.data.message);worker.terminate();}
};worker.postMessage({type:'init'});
`;
await writeFile(path.join(dist, "vision-smoke.html"), html);
await writeFile(path.join(dist, "vision-smoke.js"), script);
console.log(
  "Com a demonstração local ativa, abra http://localhost:3000/vision-smoke.html. O próximo build remove esta página de teste.",
);
