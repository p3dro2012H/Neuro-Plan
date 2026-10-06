import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app";
import { migrate } from "../src/migrate";
import { TestDatabase } from "./fixture";

test("sinal simultâneo é registrado uma vez; falha do banco não afirma salvamento", async (t) => {
  const db = new TestDatabase();
  t.after(() => db.pg.close());
  await migrate(db);
  let failed = false;
  const safe = {
    query: (sql: string, args?: any[]) => {
      if (failed) return Promise.reject(new Error("segredo-nao-deve-aparecer"));
      return db.query(sql, args);
    },
    connect: () => db.connect(),
  };
  const app = createApp(safe);
  const a = request.agent(app);
  await a
    .post("/auth/cadastro")
    .send({ nome: "Eva", email: "eva@example.com", senha: "segredo123" })
    .expect(201);
  const s = (
    await a.post("/sessoes").send({ materia: "Redes", cansaco: 2 }).expect(201)
  ).body;
  const body = {
    sessionId: s.id,
    eventoId: randomUUID(),
    tipo: "BOCEJO",
    valorMetrica: 0.8,
    timestamp: new Date().toISOString(),
  };
  const events = await Promise.all([
    a.post("/alertas").send(body),
    a.post("/alertas").send(body),
  ]);
  assert.deepEqual(events.map((r) => r.status).sort(), [200, 201]);
  assert.equal((await a.get(`/sessoes/${s.id}`)).body.resumo.totalAlertas, 1);
  failed = true;
  const failure = await a
    .post(`/sessoes/${s.id}/autorrelatos`)
    .send({ cansaco: 4 })
    .expect(503);
  assert.doesNotMatch(failure.text, /segredo-nao-deve-aparecer/);
  failed = false;
  assert.equal((await a.get(`/sessoes/${s.id}`)).body.autorrelatos.length, 1);
});
