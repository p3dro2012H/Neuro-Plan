import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { TestDatabase } from "./fixture";
import { migrate } from "../src/migrate";
import { createApp } from "../src/app";
import { recommend } from "../src/rules";

test("regras respeitam limites, janela, pausa e adiamento", () => {
  const base = {
    now: 1500000,
    cycleStarted: 0,
    deferredUntil: null,
    recentEvents: 0,
    fatigue: 2,
    paused: false,
  };
  assert.equal(recommend({ ...base, now: 1499999 }), null);
  assert.equal(recommend(base)?.origem, "TEMPO");
  assert.equal(
    recommend({ ...base, cycleStarted: 1000000, recentEvents: 1 }),
    null,
  );
  assert.equal(
    recommend({ ...base, cycleStarted: 1000000, recentEvents: 2 })?.origem,
    "SINAIS",
  );
  assert.equal(recommend({ ...base, fatigue: 4 })?.origem, "AUTORRELATO");
  assert.equal(recommend({ ...base, fatigue: 5, paused: true }), null);
  assert.equal(recommend({ ...base, deferredUntil: 1500001 }), null);
  assert.ok(recommend({ ...base, deferredUntil: 1500000 }));
});

test("API: autenticação, isolamento, deduplicação e ciclo completo", async (t) => {
  const db = new TestDatabase();
  t.after(() => db.pg.close());
  await migrate(db);
  await migrate(db);
  let now = Date.parse("2026-10-01T12:00:00Z");
  const app = createApp(db, { clock: () => now });
  const a = request.agent(app),
    b = request.agent(app);
  await a.get("/sessoes").expect(401);
  await a
    .post("/auth/cadastro")
    .send({ nome: "Ana", email: "ANA@example.com", senha: "segredo123" })
    .expect(201);
  await b
    .post("/auth/cadastro")
    .send({ nome: "Beto", email: "beto@example.com", senha: "segredo123" })
    .expect(201);
  await request(app)
    .post("/auth/login")
    .send({ email: "ana@example.com", senha: "errada" })
    .expect(401);
  await request(app)
    .post("/auth/cadastro")
    .send({ nome: "Ana", email: "ana@example.com", senha: "segredo123" })
    .expect(409);
  await a
    .post("/sessoes")
    .set("Origin", "https://malicioso.example")
    .send({ materia: "Cálculo", cansaco: 2 })
    .expect(403);
  const start = await a
    .post("/sessoes")
    .send({ materia: "Cálculo", cansaco: 2 })
    .expect(201);
  const id = start.body.id;
  const path = `/sessoes/${id}`;
  await a.post("/sessoes").send({ materia: "Outra", cansaco: 2 }).expect(409);
  const active = await a.get("/sessoes/ativa").expect(200);
  assert.equal(active.body.id, id);
  await b.get(path).expect(404);
  await b.post(`${path}/avaliar`).send({}).expect(404);
  await b.post(`${path}/autorrelatos`).send({ cansaco: 5 }).expect(404);
  await b.post(`${path}/encerrar`).send({ cansaco: 2 }).expect(404);
  await b.post(`${path}/pausas`).send({ acao: "manual" }).expect(404);
  assert.deepEqual((await b.get("/sessoes")).body, []);
  now += 1000;
  const payload = {
    sessionId: id,
    eventoId: randomUUID(),
    tipo: "OLHOS_FECHADOS",
    valorMetrica: 0.15,
    timestamp: new Date(now).toISOString(),
  };
  await b.post("/alertas").send(payload).expect(404);
  const first = await a.post("/alertas").send(payload).expect(201);
  assert.equal(first.body.resumo.totalAlertas, 1);
  assert.equal(first.body.recomendacao, null);
  const duplicate = await a.post("/alertas").send(payload).expect(200);
  assert.equal(duplicate.body.duplicado, true);
  assert.equal(duplicate.body.resumo.totalAlertas, 1);
  await a
    .post("/alertas")
    .send({ ...payload, valorMetrica: 0.18 })
    .expect(409);
  await a
    .post("/alertas")
    .send({ ...payload, eventoId: randomUUID() })
    .expect(429);
  await a
    .post("/alertas")
    .send({ ...payload, eventoId: randomUUID(), tipo: "EMOCAO" })
    .expect(400);
  await a
    .post("/alertas")
    .send({ ...payload, eventoId: randomUUID(), valorMetrica: "0.1" })
    .expect(400);
  now += 30000;
  const second = await a
    .post("/alertas")
    .send({
      ...payload,
      eventoId: randomUUID(),
      tipo: "BOCEJO",
      valorMetrica: 0.8,
      timestamp: new Date(now).toISOString(),
    })
    .expect(201);
  let pause = second.body.recomendacao;
  assert.equal(pause.origem, "SINAIS");
  const deferred = await a
    .post(`${path}/pausas`)
    .send({ acao: "adiar", pausaId: pause.id })
    .expect(200);
  assert.equal(deferred.body.recomendacao, null);
  assert.equal(deferred.body.resumo.adiadas, 1);
  now += 299999;
  assert.equal(
    (await a.post(`${path}/avaliar`).send({})).body.recomendacao,
    null,
  );
  // Após cinco minutos os eventos antigos saíram da janela; autorrelato alto é um gatilho independente.
  now += 1;
  const report = await a
    .post(`${path}/autorrelatos`)
    .send({ cansaco: 4 })
    .expect(200);
  pause = report.body.recomendacao;
  assert.equal(pause.origem, "AUTORRELATO");
  await a.post(`${path}/avaliar`).send({}).expect(200);
  assert.equal(
    (
      await db.query(
        "SELECT COUNT(*)::int AS n FROM pausas WHERE estado='PENDENTE'",
      )
    ).rows[0].n,
    1,
  );
  await a
    .post(`${path}/pausas`)
    .send({ acao: "aceitar", pausaId: pause.id })
    .expect(200);
  now += 60000;
  await a
    .post("/alertas")
    .send({
      ...payload,
      eventoId: randomUUID(),
      timestamp: new Date(now).toISOString(),
    })
    .expect(409);
  const resumed = await a
    .post(`${path}/pausas`)
    .send({ acao: "concluir", pausaId: pause.id })
    .expect(200);
  assert.equal(resumed.body.resumo.pausaSegundos, 60);
  assert.equal(resumed.body.recomendacao, null);
  assert.equal(
    (await a.post(`${path}/avaliar`).send({})).body.recomendacao,
    null,
  );
  now += 1500000;
  const timed = await a.post(`${path}/avaliar`).send({}).expect(200);
  assert.equal(timed.body.recomendacao.origem, "TEMPO");
  await a.post(`${path}/pausas`).send({ acao: "manual" }).expect(200);
  now += 300000;
  const end = await a.post(`${path}/encerrar`).send({ cansaco: 2 }).expect(200);
  assert.ok(end.body.finalizada_em);
  assert.equal(end.body.resumo.pausaSegundos, 360);
  assert.equal(end.body.resumo.estudoSegundos, 1831);
  assert.equal(
    end.body.autorrelatos.filter((r: any) => r.momento === "FIM").length,
    1,
  );
  await a.post(`${path}/encerrar`).send({ cansaco: 5 }).expect(200);
  assert.equal(
    (await a.get(path)).body.autorrelatos.filter(
      (r: any) => r.momento === "FIM",
    ).length,
    1,
  );
  await a
    .post("/alertas")
    .send({
      ...payload,
      eventoId: randomUUID(),
      timestamp: new Date(now).toISOString(),
    })
    .expect(409);
  assert.equal((await a.get("/sessoes/ativa")).body, null);
  await a.post("/auth/logout").send({}).expect(200);
  await a.get("/auth/me").expect(401);
  await a
    .post("/auth/login")
    .send({ email: "ana@example.com", senha: "segredo123" })
    .expect(200);
  await a.get(path).expect(200);
  now += 8 * 86400000;
  await a.get("/auth/me").expect(401);
});

test("inícios simultâneos, cookies seguros, origem e limite de login", async (t) => {
  const db = new TestDatabase();
  t.after(() => db.pg.close());
  await migrate(db);
  const app = createApp(db, { loginLimit: 2 });
  const agent = request.agent(app);
  await agent
    .post("/auth/cadastro")
    .send({ nome: "Caio", email: "caio@example.com", senha: "segredo123" })
    .expect(201);
  const result = await Promise.all([
    agent.post("/sessoes").send({ materia: "A", cansaco: 2 }),
    agent.post("/sessoes").send({ materia: "B", cansaco: 2 }),
  ]);
  assert.deepEqual(result.map((r) => r.status).sort(), [201, 409]);
  await request(app)
    .post("/auth/login")
    .send({ email: "ninguem@example.com", senha: "senha" })
    .expect(401);
  await request(app)
    .post("/auth/login")
    .send({ email: "ninguem@example.com", senha: "senha" })
    .expect(429);
  const prod = createApp(db, {
    production: true,
    origin: "https://neuroplan.example",
  });
  await request(prod)
    .post("/auth/login")
    .send({ email: "caio@example.com", senha: "segredo123" })
    .expect(403);
  const response = await request(prod)
    .post("/auth/login")
    .set("Origin", "https://neuroplan.example")
    .send({ email: "caio@example.com", senha: "segredo123" })
    .expect(200);
  const cookie = response.headers["set-cookie"][0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
});

test("migração preserva banco legado e janela de alertas expira", async (t) => {
  const db = new TestDatabase();
  t.after(() => db.pg.close());
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  await db.query(
    await fs.readFile(path.resolve("..", "database/schema.sql"), "utf8"),
  );
  await db.query(
    "INSERT INTO usuarios(nome,email,senha_hash) VALUES('Legado','legado@example.com','hash-antigo')",
  );
  await migrate(db);
  assert.equal(
    (await db.query("SELECT nome FROM usuarios")).rows[0].nome,
    "Legado",
  );
  const app = createApp(db, {
    clock: () => Date.parse("2026-10-01T12:00:00Z"),
  });
  const agent = request.agent(app);
  await agent
    .post("/auth/cadastro")
    .send({ nome: "Dani", email: "dani@example.com", senha: "segredo123" })
    .expect(201);
  const session = (
    await agent.post("/sessoes").send({ materia: "Teste", cansaco: 2 })
  ).body;
  await agent
    .post("/alertas")
    .send({
      sessionId: session.id,
      eventoId: randomUUID(),
      tipo: "BOCEJO",
      valorMetrica: 0.7,
      timestamp: "2026-10-01T11:58:00Z",
    })
    .expect(400);
});
