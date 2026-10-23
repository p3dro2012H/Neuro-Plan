import { test } from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../src/api";

test("API antiga retornando HTML ou JSON inválido não entrega dados aos componentes", async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  for (const [body, type] of [
    ["<!doctype html><div id='root'></div>", "text/html"],
    ["{incompleto", "application/json"],
  ]) {
    globalThis.fetch = async () =>
      new Response(body, { status: 200, headers: { "Content-Type": type } });
    for (const path of [
      "/tarefas",
      "/planejamento/preferencias",
      "/assistente/status",
    ])
      await assert.rejects(
        api(path),
        (e: unknown) =>
          e instanceof ApiError &&
          e.status === 503 &&
          /Reinicie o servidor/.test(e.message),
      );
  }
  globalThis.fetch = async () => Response.json([{ titulo: "Tarefa válida" }]);
  assert.deepEqual(await api("/tarefas"), [{ titulo: "Tarefa válida" }]);
  globalThis.fetch = async () =>
    Response.json({ erro: "Entre na sua conta." }, { status: 401 });
  await assert.rejects(
    api("/tarefas"),
    (e: unknown) =>
      e instanceof ApiError &&
      e.status === 401 &&
      e.message === "Entre na sua conta.",
  );
});
