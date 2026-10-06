// Executar com o Node e @oai/artifact-tool do runtime de apresentações do Codex.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
const root = path.resolve(import.meta.dirname, "..");
const runtime = process.env.RUNTIME_NODE_MODULES;
const skill = process.env.PRESENTATIONS_SKILL_DIR;
if (!runtime || !skill)
  throw new Error(
    "Configure RUNTIME_NODE_MODULES e PRESENTATIONS_SKILL_DIR conforme o runtime do Codex.",
  );
const { Presentation, PresentationFile } = await import(
  pathToFileURL(path.join(runtime, "@oai/artifact-tool/dist/artifact_tool.mjs"))
    .href
);
const { resolvePresentationFont, finalizePresentation } = await import(
  pathToFileURL(path.join(skill, "container_tools/artifact_tool_utils.mjs"))
    .href
);
const family = resolvePresentationFont({ fontFamily: "Arial" });
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const build = path.join(root, ".build", process.argv[2] ? `slides-${path.parse(process.argv[2]).name}` : "slides");
await fs.mkdir(build, { recursive: true });
await fs.mkdir(path.join(root, "apresentacao"), { recursive: true });
function text(
  s,
  value,
  x,
  y,
  w,
  h,
  size = 30,
  color = "#213D35",
  bold = false,
) {
  const t = s.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { fill: "none", width: 0 },
  });
  t.text = value;
  t.text.style = {
    typeface: family,
    fontSize: size,
    color,
    bold,
    autoFit: "none",
  };
  return t;
}
function slide(title, notes) {
  const s = p.slides.add();
  s.background.fill = "#F5F5EE";
  text(s, title, 72, 58, 1136, 85, 46, "#183F38", true);
  s.speakerNotes.textFrame.setText(notes);
  return s;
}
function rows(s, items, start = 200) {
  items.forEach((item, i) => {
    text(
      s,
      String(i + 1).padStart(2, "0"),
      72,
      start + i * 120,
      80,
      65,
      44,
      "#8D9E77",
    );
    text(s, item[0], 178, start + i * 120, 970, 52, 32, "#183F38", true);
    text(s, item[1], 178, start + i * 120 + 48, 970, 65, 26, "#627064");
  });
}
let s = p.slides.add();
s.background.fill = "#183F38";
text(s, "NeuroPlan", 72, 172, 1080, 130, 94, "#F5F5EE", true);
text(s, "Apoio a pausas durante os estudos", 76, 335, 1070, 75, 42, "#D5E0BD");
text(
  s,
  "Protótipo acadêmico · Visão computacional no navegador",
  76,
  525,
  1080,
  60,
  27,
  "#C1D1BF",
);
s.speakerNotes.textFrame.setText(
  "35 segundos. Apresentar equipe, disciplina e objetivo. A prevenção de burnout é motivação; este protótipo não demonstra esse efeito.",
);
s = slide(
  "Problema e objetivo",
  "45 segundos. Explicar a ambiguidade dos sinais. A OMS define burnout no contexto ocupacional, por isso o estudo acadêmico exige fundamentação própria. Fonte: https://www.who.int/news/item/28-05-2019-burn-out-an-occupational-phenomenon-international-classification-of-diseases",
);
text(
  s,
  "Acompanhar o estudo e oferecer\nespaço para descansar",
  72,
  195,
  1080,
  150,
  54,
  "#183F38",
  true,
);
text(
  s,
  "Sinais visuais + tempo de estudo + cansaço informado",
  72,
  398,
  1120,
  65,
  31,
);
text(
  s,
  "Sugestões experimentais. A escolha continua com o estudante.",
  72,
  500,
  1080,
  80,
  30,
  "#627064",
);
s = slide(
  "Experiência do estudante",
  "50 segundos. Percorrer o fluxo. Cadastro e histórico são individuais. Câmera opcional, sem upload de vídeo. Autorizar notificações e estudar em outra aba ou programa com o NeuroPlan aberto. O clique no aviso retorna para revisar a pausa. Computador acordado; navegador pode atrasar avisos. Fonte: https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API",
);
rows(s, [
  ["Preparar", "Entrar, escolher a matéria e informar o cansaço."],
  [
    "Estudar e escolher",
    "Estudar em outra aba; receber aviso e escolher a pausa.",
  ],
  ["Retomar e registrar", "Concluir a pausa, encerrar e consultar o resumo."],
]);
s = slide(
  "Arquitetura do sistema",
  "60 segundos. Explicar que a inferência ocorre no Web Worker. Somente eventos e autorrelatos seguem para a API; PostgreSQL guarda usuários/sessões/pausas. Produção: Express serve React no Render; banco Neon. Fonte MediaPipe: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js",
);
text(s, "Navegador", 72, 216, 300, 60, 38, "#183F38", true);
text(s, "API", 492, 216, 270, 60, 38, "#183F38", true);
text(s, "PostgreSQL", 902, 216, 300, 60, 38, "#183F38", true);
text(s, "→", 390, 217, 70, 60, 45, "#8D9E77");
text(s, "→", 800, 217, 70, 60, 45, "#8D9E77");
text(
  s,
  "React + MediaPipe\nCâmera e Web Worker\nMétricas EAR / MAR",
  72,
  305,
  320,
  180,
  29,
);
text(
  s,
  "Express + TypeScript\nAutenticação e validação\nRegras de pausa",
  492,
  305,
  320,
  180,
  29,
);
text(
  s,
  "Usuários e sessões\nSinais e autorrelatos\nRecomendações e pausas",
  902,
  305,
  305,
  180,
  29,
);
text(
  s,
  "As imagens permanecem no navegador.",
  72,
  568,
  1130,
  65,
  35,
  "#627064",
);
s = slide(
  "Modelo pré-treinado e métricas",
  "65 segundos. MediaPipe Face Landmarker do Google fornece landmarks. A equipe adapta EAR/MAR do Python e implementa persistência temporal; não treina emoções. Fonte: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js. Limiares são experimentais, herdados do protótipo inicial.",
);
rows(s, [
  [
    "MediaPipe Face Landmarker",
    "Localiza pontos do rosto com um modelo pré-treinado.",
  ],
  [
    "EAR · proporção dos olhos",
    "Abaixo de 0,21 por 2,5 segundos: fechamento sustentado.",
  ],
  [
    "MAR · proporção da boca",
    "Acima de 0,60 por 1,2 segundo: possível bocejo.",
  ],
]);
s = slide(
  "Regras de recomendação",
  "65 segundos. Um sinal gera aviso; dois em cinco minutos sugerem pausa. Alternativas: 25 min ou cansaço 4–5. Uma sugestão por vez, cooldown 30 s, um evento por ocorrência/tipo. Adiar suprime sugestões por 5 min; concluir reinicia o ciclo. São regras experimentais, sem validação clínica.",
);
rows(s, [
  ["Sinais recorrentes", "Dois eventos em 5 minutos do ciclo atual."],
  ["Tempo ou autorrelato", "25 minutos de estudo contínuo ou cansaço 4–5."],
  [
    "Pausa de 5 minutos",
    "Aceitar, adiar por 5 minutos ou iniciar manualmente.",
  ],
]);
s = slide(
  "Como o protótipo foi criado",
  "55 segundos. Mostrar repositório e explicar código da equipe. Python original preservado; frontend e API integrados; migrações e testes. Informar apoio de IA conforme normas da faculdade. Não afirmar que a equipe treinou MediaPipe.",
);
rows(s, [
  ["Base inicial", "Detector Python, API Express e schema PostgreSQL."],
  [
    "Integração no navegador",
    "Worker, interface, contas, sessões e histórico.",
  ],
  [
    "Consistência e publicação",
    "Transações, migrações, testes e configuração Render/Neon.",
  ],
]);
s = slide(
  "Verificação e evidências",
  "55 segundos. Testes automatizados executados: regras temporais, banco/migração legado, auth/isolamento/cookies/origem, eventos únicos e detector sintético. Ver docs/RESULTADOS.md. Avaliação real de webcam/voluntários e publicação ficam pendentes; não inventar acurácia.",
);
rows(s, [
  [
    "Regras e detecção",
    "Sequências sintéticas: piscadas, persistência e rosto ausente.",
  ],
  ["API e banco", "Login, isolamento, eventos únicos, pausas e migrações."],
  [
    "Avaliação com pessoas",
    "A realizar: iluminação, óculos, falsos alertas e utilidade.",
  ],
]);
s = slide(
  "Demonstração do protótipo",
  "90 segundos. Usar dados fictícios. Iniciar com cansaço 2; ativar câmera só com consentimento. Registrar cansaço 4 gera sugestão; adiar; iniciar pausa manual; concluir; encerrar e ver histórico. Esse gatilho é demonstração de regra, não prova de fadiga detectada. Screenshot: aplicativo local real, conta fictícia.",
);
text(
  s,
  "Iniciar sessão\n\nInformar cansaço\n\nEscolher uma pausa\n\nConsultar histórico",
  72,
  208,
  350,
  405,
  31,
);
const photo = await fs.readFile(path.join(root, "apresentacao/prototipo.jpg"));
s.images.add({
  blob: new Uint8Array(photo),
  contentType: "image/jpeg",
  position: { left: 452, top: 180, width: 755, height: 485 },
  fit: "contain",
  alt: "Interface real do NeuroPlan com recomendação de pausa",
});
s = slide(
  "Limitações e próximos passos",
  "20 segundos. Reconhecer limitações, sem prometer prevenção de burnout. Melhorias futuras dependem de avaliação: calibração individual e pesquisa de utilidade.",
);
text(
  s,
  "Fala pode parecer bocejo.\nIluminação e posição alteram as métricas.\nSinais isolados não confirmam fadiga.",
  72,
  210,
  1120,
  220,
  38,
);
text(
  s,
  "Próximo passo: avaliar falsos alertas\ne a utilidade das sugestões com voluntários.",
  72,
  494,
  1120,
  140,
  34,
  "#627064",
);
const candidate = path.join(build, "candidate.pptx");
await (await PresentationFile.exportPptx(p)).save(candidate);
const output = path.join(root, "apresentacao", process.argv[2] ?? "NeuroPlan.pptx");
await finalizePresentation({
  workspaceDir: root,
  candidatePath: candidate,
  finalPath: output,
  pythonExecutable: process.env.RUNTIME_PYTHON,
  integrityValidatorPath: path.join(
    skill,
    "container_tools/inspect_presentation_package_integrity.py",
  ),
  layoutValidatorPath: path.join(
    skill,
    "container_tools/inspect_presentation_layout_geometry.py",
  ),
  layoutArgs: [
    "--expected-slide-size-emu",
    "12192000,6858000",
    "--validate-bullet-geometry",
    "--validate-heading-fit",
  ],
  explicitTotalSlideCount: 10,
  fontPolicy: { basis: "design", families: [family] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(build, "validation.json"),
});
for (let i = 0; i < 10; i++) {
  const png = await p.export({
    slide: p.slides.items[i],
    format: "png",
    scale: 1,
  });
  await fs.writeFile(
    path.join(build, `slide-${i + 1}.png`),
    new Uint8Array(await png.arrayBuffer()),
  );
}
console.log(output);
