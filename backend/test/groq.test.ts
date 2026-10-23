import { test } from "node:test";
import assert from "node:assert/strict";
import { groqProvider } from "../src/groq";
test("adaptador Groq: schema estrito, chave privada, histórico, quota e falhas", async (t) => {
  let mode = "ok";
  let url = "";
  let body: any;
  let headers: any;
  const signal = new AbortController().signal;
  t.mock.method(globalThis, "fetch", async (endpoint: any, options: any) => {
    url = String(endpoint);
    body = JSON.parse(options.body);
    headers = options.headers;
    assert.equal(options.signal, signal);
    if (mode === "quota") return new Response("", { status: 429 });
    if (mode === "outage") return new Response("", { status: 500 });
    if (mode === "credentials")
      return new Response("secret-provider-error", { status: 401 });
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: mode === "truncated" ? "length" : "stop",
            message: {
              content:
                mode === "invalid"
                  ? "não é JSON"
                  : JSON.stringify({
                      texto: "Informe a disponibilidade.",
                      proposta: null,
                    }),
              ...(mode === "refusal" ? { refusal: "Recusado" } : {}),
            },
          },
        ],
      }),
      { status: 200 },
    );
  });
  const provider = groqProvider(
    "segredo-apenas-servidor",
    "openai/gpt-oss-20b",
  );
  const input = {
    historico: [
      { role: "user" as const, texto: "Tenho prova" },
      { role: "model" as const, texto: "Qual o prazo?" },
    ],
    texto: "Organizar semana",
    contexto: { tarefas: [] },
  };
  assert.deepEqual(await provider(input, signal), {
    texto: "Informe a disponibilidade.",
    proposta: null,
  });
  assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(headers.Authorization, "Bearer segredo-apenas-servidor");
  assert.equal(JSON.stringify(body).includes("segredo-apenas-servidor"), false);
  assert.equal(body.model, "openai/gpt-oss-20b");
  assert.equal(body.response_format.type, "json_schema");
  assert.equal(body.response_format.json_schema.strict, true);
  function checkClosed(schema: any) {
    if (schema.type === "object") {
      assert.equal(schema.additionalProperties, false);
      assert.deepEqual(
        Object.keys(schema.properties).sort(),
        [...schema.required].sort(),
      );
      Object.values(schema.properties).forEach(checkClosed);
    }
    if (schema.items) checkClosed(schema.items);
    if (schema.anyOf) schema.anyOf.forEach(checkClosed);
  }
  checkClosed(body.response_format.json_schema.schema);
  assert.deepEqual(
    body.messages.map((m: any) => m.role),
    ["system", "user", "assistant", "user"],
  );
  assert.equal(body.messages.at(-1).content, input.texto);
  for (const failure of [
    "quota",
    "outage",
    "credentials",
    "invalid",
    "truncated",
    "refusal",
  ]) {
    mode = failure;
    await assert.rejects(
      provider(input, signal),
      (e: any) =>
        e.status === (failure === "quota" ? 429 : 503) &&
        !e.message.includes("secret-provider-error"),
    );
  }
});
