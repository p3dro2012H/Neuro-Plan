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
const build = path.join(
  root,
  ".build",
  process.argv[2] ? `slides-${path.parse(process.argv[2]).name}` : "slides",
);
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
text(
  s,
  "Organização dos estudos e apoio a pausas",
  76,
  335,
  1070,
  75,
  42,
  "#D5E0BD",
);
text(
  s,
  "Tarefas e planejamento · Visão computacional como diferencial",
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
  "Organizar tarefas, planejar o estudo\ne oferecer espaço para pausas",
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
  "Planejamento manual + assistente de IA + câmera opcional",
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
  "50 segundos. Mostrar organizador disponível a todas as contas. Criar tarefas, disponibilidade e compromissos. Próximos sete dias, sem recorrência ou calendário externo. Bloco de estudo apenas preenche matéria; iniciar manualmente. Em sessão, autorizar notificações de pausa e estudar em outra aba com NeuroPlan aberto. Câmera opcional, sem upload.",
);
rows(s, [
  ["Organizar", "Cadastrar tarefas, disponibilidade e compromissos."],
  [
    "Planejar e revisar",
    "Montar sete dias manualmente ou revisar uma proposta da IA.",
  ],
  [
    "Estudar e escolher",
    "Preparar a matéria, iniciar estudo e escolher suas pausas.",
  ],
]);
s = slide(
  "Arquitetura do sistema",
  "60 segundos. React envia tarefas e horários à API, que autentica e valida. PostgreSQL guarda dados por conta. Groq é chamado somente pelo servidor, com chave privada e contexto escolhido. Sem dados faciais ou cansaço no pedido de IA. Face Landmarker executa localmente no worker; imagens não seguem à API. Produção prevista: Express e React no Render, banco Neon. Demo local usa PGlite. Fontes: https://console.groq.com/docs/structured-outputs e https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js",
);
text(s, "Navegador", 72, 216, 300, 60, 38, "#183F38", true);
text(s, "API", 492, 216, 270, 60, 38, "#183F38", true);
text(s, "PostgreSQL", 902, 216, 300, 60, 38, "#183F38", true);
text(s, "→", 390, 217, 70, 60, 45, "#8D9E77");
text(s, "→", 800, 217, 70, 60, 45, "#8D9E77");
text(
  s,
  "React + agenda\nCâmera e Web Worker\nMétricas EAR / MAR",
  72,
  305,
  320,
  180,
  29,
);
text(
  s,
  "Express + TypeScript\nValidação e autorização\nGroq pelo servidor",
  492,
  305,
  320,
  180,
  29,
);
text(
  s,
  "Tarefas e agenda\nConversas e propostas\nSessões e pausas",
  902,
  305,
  305,
  180,
  29,
);
text(
  s,
  "Imagens locais. A IA recebe apenas o contexto de planejamento.",
  72,
  568,
  1130,
  65,
  35,
  "#627064",
);
s = slide(
  "Modelo pré-treinado e métricas",
  "65 segundos. MediaPipe pré-treinado fornece pontos; equipe adapta EAR/MAR e persistência temporal do Python. Não treina emoções. Um sinal gera aviso; dois em cinco minutos sugerem pausa de cinco minutos, assim como 25 minutos ou cansaço 4–5. Adiar por cinco minutos, aceitar ou pausa manual. São regras experimentais, sem validação clínica. Fonte: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js",
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
  "Assistente: revisão antes de salvar",
  "65 segundos. IA disponível para todas as contas autenticadas, sem convites. Chave configurada uma única vez pelo dono no servidor. Groq produz JSON; Zod e o servidor verificam horários, conflitos, prazo e sete dias. A equipe desenvolve a integração, não treina o modelo usado pela Groq. Pedidos limitados a cinco por minuto e vinte por dia, timeout trinta segundos. Sem disponibilidade, perguntar; explicar atividades que não couberem. Serviço indisponível mantém organizador manual. Usar Groq Free, sem método de pagamento ou upgrade. Chamada real validada em 6 de outubro de 2026. Termos e privacidade: https://console.groq.com/docs/legal/services-agreement",
);
rows(s, [
  [
    "Entrar e conversar",
    "Acesso para todas as contas; chave privada no servidor.",
  ],
  ["Proposta editável", "Tarefas selecionadas, horários disponíveis e pausas."],
  [
    "Confirmação do estudante",
    "Editar, salvar ou descartar; reenvios não duplicam itens.",
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
    "Agenda, tarefas, contas, worker e histórico de estudo.",
  ],
  [
    "Consistência e publicação",
    "Groq, validação, migrações, testes e Render/Neon.",
  ],
]);
s = slide(
  "Verificação e evidências",
  "55 segundos. Ver docs/RESULTADOS.md. Testes de auth e isolamento, bloqueio sem login por chamadas diretas, horários, fusos, confirmação idempotente, respostas inválidas, timeout e quota. Chrome headless confirmou fluxo manual e proposta com edição e recarga usando provedor de IA simulado. Chamada real confirmou resposta em português, JSON válido e pergunta por disponibilidade. Publicação e avaliação de utilidade com pessoas continuam pendentes.",
);
rows(s, [
  [
    "Regras e detecção",
    "Sequências sintéticas: piscadas, persistência e rosto ausente.",
  ],
  ["API e planejamento", "Login, isolamento, horários, reenvio e quota."],
  [
    "Dois fluxos no navegador",
    "Duas contas sem convites; edição e recarga da proposta.",
  ],
]);
s = slide(
  "Demonstração do protótipo",
  "90 segundos. Criar tarefa, salvar disponibilidade e acrescentar bloco manual. Com a chave da Groq configurada, dividir tarefa, editar cartões e salvar; caso contrário, mostrar teste simulado claramente identificado. Recarregar agenda, preparar matéria e iniciar estudo manualmente. Autorrelato 4 demonstra regra de pausa, não acurácia facial. Screenshot do aplicativo real em Chrome com conta fictícia e proposta simulada no teste.",
);
text(
  s,
  "Cadastrar uma tarefa\n\nDefinir horários\n\nRevisar proposta\n\nSalvar e estudar",
  72,
  208,
  350,
  405,
  31,
);
const photo = await fs.readFile(path.join(root, ".build/planning-agenda.png"));
s.images.add({
  blob: new Uint8Array(photo),
  contentType: "image/png",
  position: { left: 452, top: 180, width: 755, height: 485 },
  fit: "contain",
  alt: "Agenda e tarefas reais do NeuroPlan com dados fictícios e resposta de IA simulada no teste",
});
s = slide(
  "Limitações e próximos passos",
  "20 segundos. Reconhecer limitações, sem prometer prevenção de burnout. Melhorias futuras dependem de avaliação: calibração individual e pesquisa de utilidade.",
);
text(
  s,
  "A IA pode errar: revisão é necessária.\nA câmera depende de luz e posição.\nSinais visuais não confirmam fadiga.",
  72,
  210,
  1120,
  220,
  38,
);
text(
  s,
  "Próximo passo: publicar e avaliar\na utilidade com voluntários.",
  72,
  494,
  1120,
  140,
  34,
  "#627064",
);
const candidate = path.join(build, "candidate.pptx");
await (await PresentationFile.exportPptx(p)).save(candidate);
const output = path.join(
  root,
  "apresentacao",
  process.argv[2] ?? "NeuroPlan.pptx",
);
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
