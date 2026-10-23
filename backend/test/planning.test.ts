import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { TestDatabase } from "./fixture";
import { migrate } from "../src/migrate";
import { createApp } from "../src/app";
import { AssistantInput, AssistantProvider } from "../src/groq";
import { HttpError } from "../src/database";
const now = Date.parse("2026-10-06T12:00:00Z");
const preferences = {
  fuso: "America/Sao_Paulo",
  disponibilidade: Array.from({ length: 7 }, (_, dia) => ({
    dia,
    inicio: "08:00",
    fim: "22:00",
  })),
  compromissos: [],
};
const task = {
  titulo: "Preparar seminário",
  materia: "História",
  prazo: null,
  estimativaMin: 50,
  prioridade: "ALTA",
  concluida: false,
};
const block = {
  titulo: "Pesquisar fontes",
  materia: "História",
  tipo: "ESTUDO",
  inicio: "2026-10-06T13:00:00Z",
  fim: "2026-10-06T13:25:00Z",
  tarefaRef: null,
};
test("conta existente preserva tarefas, conversa e proposta ao reiniciar a API", async (t) => {
  const provider: AssistantProvider = async () => ({
    texto: "Revise o bloco antes de salvar.",
    proposta: { tarefas: [], blocos: [block] },
  });
  const { db, adult: account } = await setup(t, provider);
  await account.put("/planejamento/preferencias").send(preferences).expect(200);
  const created = (await account.post("/tarefas").send(task).expect(200)).body;
  const payload = {
    pedidoId: randomUUID(),
    texto: "Organizar estudo",
    tarefaIds: [created.id],
  };
  const message = (
    await account.post("/assistente/mensagens").send(payload).expect(200)
  ).body;
  const restarted = request.agent(
    createApp(db, { clock: () => now, assistantProvider: provider }),
  );
  await restarted
    .post("/auth/login")
    .send({ email: "adulto@example.com", senha: "segredo123" })
    .expect(200);
  assert.deepEqual((await restarted.get("/assistente/status")).body, {
    configurado: true,
  });
  assert.equal((await restarted.get("/tarefas")).body[0].id, created.id);
  assert.equal(
    (await restarted.get("/assistente/mensagens")).body[0].id,
    message.id,
  );
  await restarted
    .get("/assistente/propostas/" + message.proposta_id)
    .expect(200);
  await restarted.post("/assistente/mensagens").send(payload).expect(200);
  for (let i = 0; i < 2; i++)
    await restarted
      .post("/assistente/propostas/" + message.proposta_id + "/confirmar")
      .send({})
      .expect(200);
  assert.equal((await restarted.get("/assistente/mensagens")).body.length, 1);
  assert.equal((await restarted.get("/planejamentos")).body.blocos.length, 1);
});
test("assistente exige login em todas as rotas e funciona sem configuração só para consulta", async (t) => {
  const { app, minor: account } = await setup(t);
  const id = randomUUID();
  for (const [method, path] of [
    ["get", "/assistente/status"],
    ["get", "/assistente/mensagens"],
    ["post", "/assistente/mensagens"],
    ["delete", "/assistente/mensagens"],
    ["get", "/assistente/propostas/" + id],
    ["put", "/assistente/propostas/" + id],
    ["delete", "/assistente/propostas/" + id],
    ["post", "/assistente/propostas/" + id + "/confirmar"],
  ] as const) {
    const call = request(app)[method](path);
    if (method !== "get") call.send({});
    await call.expect(401);
  }
  assert.deepEqual((await account.get("/assistente/status")).body, {
    configurado: false,
  });
  await account.get("/assistente/mensagens").expect(200);
  await account
    .post("/assistente/mensagens")
    .send({ pedidoId: id, texto: "Organizar semana", tarefaIds: [] })
    .expect(503);
  await account.delete("/assistente/mensagens").send({}).expect(200);
  await account.post("/tarefas").send(task).expect(200);
  await account
    .post("/assistente/mensagens")
    .set("Origin", "https://malicioso.example")
    .send({ pedidoId: id, texto: "Teste" })
    .expect(403);
});
async function setup(t: any, provider?: AssistantProvider, timeoutMs?: number) {
  const db = new TestDatabase();
  t.after(() => db.pg.close());
  await migrate(db);
  let time = now;
  const app = createApp(db, {
    clock: () => time,
    assistantProvider: provider ?? null,
    assistantTimeoutMs: timeoutMs,
  });
  const adult = request.agent(app),
    minor = request.agent(app),
    other = request.agent(app);
  for (const [agent, email] of [
    [adult, "adulto"],
    [minor, "menor"],
    [other, "outro"],
  ] as const)
    await agent
      .post("/auth/cadastro")
      .send({ nome: email, email: email + "@example.com", senha: "segredo123" })
      .expect(201);
  return {
    db,
    app,
    adult,
    minor,
    other,
    setTime: (value: number) => (time = value),
  };
}

test("planejamento manual: autenticação, isolamento, CRUD e reenvio sem duplicar", async (t) => {
  const { db, app, adult: a, minor: b } = await setup(t);
  for (const path of [
    "/tarefas",
    "/planejamentos",
    "/planejamento/preferencias",
    "/assistente/status",
  ])
    await request(app).get(path).expect(401);
  await b.put("/planejamento/preferencias").send(preferences).expect(200);
  const created = (await b.post("/tarefas").send(task).expect(200)).body;
  assert.deepEqual((await a.get("/tarefas")).body, []);
  await a
    .put("/tarefas/" + created.id)
    .send(task)
    .expect(404);
  await a
    .delete("/tarefas/" + created.id)
    .send({})
    .expect(404);
  const payload = {
    pedidoId: randomUUID(),
    tarefas: [],
    blocos: [{ ...block, tarefaRef: created.id }],
  };
  const saved = (await b.post("/planejamentos").send(payload).expect(200)).body;
  assert.deepEqual(
    (await b.post("/planejamentos").send(payload).expect(200)).body,
    saved,
  );
  await b
    .post("/planejamentos")
    .send({ ...payload, blocos: [{ ...block, titulo: "Mudou" }] })
    .expect(409);
  assert.equal(
    (await db.query("SELECT COUNT(*)::int AS n FROM planejamento_blocos"))
      .rows[0].n,
    1,
  );
  const id = saved.blocos[0].id;
  await a
    .put("/planejamentos/" + id)
    .send(block)
    .expect(404);
  await a
    .delete("/planejamentos/" + id)
    .send({})
    .expect(404);
  await b
    .put("/planejamentos/" + id)
    .send({
      ...block,
      tarefaRef: created.id,
      inicio: "2026-10-06T14:00:00Z",
      fim: "2026-10-06T14:25:00Z",
    })
    .expect(200);
  await b
    .put("/tarefas/" + created.id)
    .send({ ...task, concluida: true })
    .expect(200);
  await b
    .post("/planejamentos")
    .send({
      pedidoId: randomUUID(),
      tarefas: [],
      blocos: [{ ...block, tarefaRef: created.id }],
    })
    .expect(400);
  await b
    .delete("/planejamentos/" + id)
    .send({})
    .expect(200);
  await b
    .delete("/tarefas/" + created.id)
    .send({})
    .expect(200);
  assert.deepEqual((await b.get("/tarefas")).body, []);
});

test("horários: duração, disponibilidade, compromissos, conflito, prazo, fuso e sete dias", async (t) => {
  const { adult: a } = await setup(t);
  const save = (b: any) =>
    a
      .post("/planejamentos")
      .send({ pedidoId: randomUUID(), tarefas: [], blocos: [b] });
  await save(block).expect(400);
  await a
    .put("/planejamento/preferencias")
    .send({ ...preferences, fuso: "inventado" })
    .expect(400);
  await a
    .put("/planejamento/preferencias")
    .send({
      ...preferences,
      compromissos: [
        {
          titulo: "Aula",
          inicio: "2026-10-06T13:00:00Z",
          fim: "2026-10-06T14:00:00Z",
        },
      ],
    })
    .expect(200);
  await save(block).expect(400);
  await a.put("/planejamento/preferencias").send(preferences).expect(200);
  await save({ ...block, fim: block.inicio }).expect(400);
  await save({ ...block, inicio: "2026-10-06T11:59:00Z" }).expect(400);
  await save({
    ...block,
    inicio: "2026-10-13T13:00:00Z",
    fim: "2026-10-13T13:25:00Z",
  }).expect(400);
  await save({
    ...block,
    inicio: "2026-10-06T23:00:00-03:00",
    fim: "2026-10-06T23:25:00-03:00",
  }).expect(400);
  await save(block).expect(200);
  await save({
    ...block,
    inicio: "2026-10-06T13:10:00Z",
    fim: "2026-10-06T13:40:00Z",
  }).expect(400);
  const tz = await a
    .put("/planejamento/preferencias")
    .send({ ...preferences, fuso: "America/Cayenne" })
    .expect(200);
  assert.equal(tz.body.fuso, "America/Cayenne");
  await a
    .put("/planejamento/preferencias")
    .send({ ...preferences, fuso: "Asia/Tokyo" })
    .expect(400);
  const early = (
    await a.post("/tarefas").send({ ...task, prazo: "2026-10-06T12:30:00Z" })
  ).body;
  await save({
    ...block,
    inicio: "2026-10-06T15:00:00Z",
    fim: "2026-10-06T15:25:00Z",
    tarefaRef: early.id,
  }).expect(400);
});

test("assistente: acesso de qualquer conta, isolamento, dados selecionados e confirmação idempotente", async (t) => {
  let calls = 0;
  let captured: AssistantInput | undefined;
  const {
    adult: a,
    minor: b,
    other: c,
    db,
  } = await setup(t, async (input) => {
    calls++;
    captured = input;
    return {
      texto: "Revise os blocos antes de salvar.",
      proposta: {
        tarefas: [
          {
            ref: "parte1",
            titulo: "Pesquisar fontes",
            materia: "História",
            prazo: null,
            estimativaMin: 25,
            prioridade: "ALTA",
          },
        ],
        blocos: [{ ...block, tarefaRef: "parte1" }],
      },
    };
  });
  await a.put("/planejamento/preferencias").send(preferences).expect(200);
  assert.deepEqual((await b.get("/assistente/status")).body, {
    configurado: true,
  });
  assert.deepEqual((await b.get("/assistente/mensagens")).body, []);
  const selected = (await a.post("/tarefas").send(task)).body;
  await a.post("/tarefas").send({ ...task, titulo: "Privada não selecionada" });
  const payload = {
    pedidoId: randomUUID(),
    texto: "Dividir uma tarefa",
    tarefaIds: [selected.id],
  };
  const response = (
    await a.post("/assistente/mensagens").send(payload).expect(200)
  ).body;
  await a.post("/assistente/mensagens").send(payload).expect(200);
  assert.equal(calls, 1);
  await a
    .post("/assistente/mensagens")
    .send({ ...payload, texto: "Outro" })
    .expect(409);
  assert.equal((captured!.contexto as any).tarefas.length, 1);
  assert.equal(JSON.stringify(captured).includes("example.com"), false);
  assert.equal(JSON.stringify(captured).includes("Privada"), false);
  assert.equal(JSON.stringify(captured).includes("cansaco"), false);
  assert.equal((await a.get("/planejamentos")).body.blocos.length, 0);
  const id = response.proposta_id;
  await b.get("/assistente/propostas/" + id).expect(404);
  await b
    .post("/assistente/propostas/" + id + "/confirmar")
    .send({})
    .expect(404);
  await b
    .put("/assistente/propostas/" + id)
    .send(response.proposta)
    .expect(409);
  await b
    .delete("/assistente/propostas/" + id)
    .send({})
    .expect(409);
  assert.deepEqual((await b.get("/assistente/mensagens")).body, []);
  assert.match(
    response.resposta,
    /Tempo ainda não reservado.*Preparar seminário/,
  );
  await c.get("/assistente/propostas/" + id).expect(404);
  await c
    .post("/assistente/propostas/" + id + "/confirmar")
    .send({})
    .expect(404);
  const edited = {
    ...response.proposta,
    blocos: [
      {
        ...block,
        tarefaRef: "parte1",
        inicio: "2026-10-06T14:00:00Z",
        fim: "2026-10-06T14:25:00Z",
      },
    ],
  };
  await a
    .put("/assistente/propostas/" + id)
    .send(edited)
    .expect(200);
  const result = (
    await a
      .post("/assistente/propostas/" + id + "/confirmar")
      .send({})
      .expect(200)
  ).body;
  assert.deepEqual(
    (
      await a
        .post("/assistente/propostas/" + id + "/confirmar")
        .send({})
        .expect(200)
    ).body,
    result,
  );
  assert.equal((await a.get("/tarefas")).body.length, 3);
  assert.equal((await a.get("/planejamentos")).body.blocos.length, 1);
  assert.equal(
    (await db.query("SELECT COUNT(*)::int AS n FROM assistente_mensagens"))
      .rows[0].n,
    1,
  );
  await a.delete("/assistente/mensagens").send({}).expect(200);
  assert.deepEqual((await a.get("/assistente/mensagens")).body, []);
  assert.equal((await a.get("/planejamentos")).body.blocos.length, 1);
  await b.put("/planejamento/preferencias").send(preferences).expect(200);
  const second = (
    await b
      .post("/assistente/mensagens")
      .send({
        pedidoId: randomUUID(),
        texto: "Organizar minha semana",
        tarefaIds: [],
      })
      .expect(200)
  ).body;
  await b
    .post("/assistente/propostas/" + second.proposta_id + "/confirmar")
    .send({})
    .expect(200);
  assert.equal((await b.get("/planejamentos")).body.blocos.length, 1);
  assert.equal((await a.get("/planejamentos")).body.blocos.length, 1);
});

test("respostas inválidas, falta de disponibilidade, falha, timeout e cotas preservam organizador", async (t) => {
  let mode = "invalid";
  const {
    adult: a,
    setTime,
    db,
  } = await setup(
    t,
    async () => {
      if (mode === "invalid") return { texto: 3 };
      if (mode === "proposal")
        return {
          texto: "Proposta",
          proposta: { tarefas: [], blocos: [block] },
        };
      if (mode === "outage") throw new HttpError(503, "Indisponível");
      if (mode === "timeout") return new Promise(() => {});
      return { texto: "Informe sua disponibilidade.", proposta: null };
    },
    15,
  );
  const send = () =>
    a.post("/assistente/mensagens").send({
      pedidoId: randomUUID(),
      texto: "Organizar minha semana",
      tarefaIds: [],
    });
  await send().expect(503);
  mode = "proposal";
  await send().expect(503);
  mode = "outage";
  await send().expect(503);
  mode = "timeout";
  await send().expect(503);
  mode = "ok";
  await send().expect(200);
  await send().expect(429);
  assert.equal((await a.get("/planejamentos")).body.blocos.length, 0);
  await a.post("/tarefas").send(task).expect(200);
  for (let minute = 1; minute <= 3; minute++) {
    setTime(now + minute * 61000);
    for (let i = 0; i < 5; i++) await send().expect(200);
  }
  setTime(now + 4 * 61000);
  await send().expect(429);
  assert.equal(
    (await db.query("SELECT COUNT(*)::int AS n FROM assistente_uso")).rows[0].n,
    20,
  );
  setTime(Date.parse("2026-10-07T12:00:00Z"));
  await send().expect(200);
});

test("contexto limitado a doze mensagens, descarte e tarefas concluídas", async (t) => {
  let captured: AssistantInput | undefined;
  let draft = false;
  const { adult: a, setTime } = await setup(t, async (input) => {
    captured = input;
    return {
      texto: "Como deseja priorizar?",
      proposta: draft ? { tarefas: [], blocos: [block] } : null,
    };
  });
  const completed = (
    await a.post("/tarefas").send({ ...task, concluida: true })
  ).body;
  await a
    .post("/assistente/mensagens")
    .send({
      pedidoId: randomUUID(),
      texto: "Dividir",
      tarefaIds: [completed.id],
    })
    .expect(400);
  for (let i = 0; i < 8; i++) {
    setTime(now + i * 61000);
    await a
      .post("/assistente/mensagens")
      .send({ pedidoId: randomUUID(), texto: "Mensagem " + i, tarefaIds: [] })
      .expect(200);
  }
  assert.equal(captured!.historico.length, 12);
  assert.equal(captured!.historico[0].texto, "Mensagem 1");
  await a.put("/planejamento/preferencias").send(preferences).expect(200);
  draft = true;
  setTime(now + 8 * 61000);
  const response = (
    await a
      .post("/assistente/mensagens")
      .send({
        pedidoId: randomUUID(),
        texto: "Proposta descartável",
        tarefaIds: [],
      })
      .expect(200)
  ).body;
  await a
    .delete("/assistente/propostas/" + response.proposta_id)
    .send({})
    .expect(200);
  await a
    .post("/assistente/propostas/" + response.proposta_id + "/confirmar")
    .send({})
    .expect(409);
  assert.equal((await a.get("/planejamentos")).body.blocos.length, 0);
});
