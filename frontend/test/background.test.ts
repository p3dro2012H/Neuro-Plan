import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  FrameContinuity,
  notificationKey,
  shouldNotify,
  shouldCloseNotification,
} from "../src/notification-policy";
import { SignalDetector } from "../src/detection";
import type { StudySession } from "../src/types";

const session = {
  id: "session-1",
  finalizada_em: null,
  adiada_ate: null,
  recomendacao: { id: 7, estado: "PENDENTE" },
} as StudySession;

test("atualização da sessão preserva o aviso de teste e fecha recomendações desatualizadas", () => {
  assert.equal(shouldCloseNotification("neuroplan:test", null), false);
  assert.equal(
    shouldCloseNotification("neuroplan:current", "neuroplan:current"),
    false,
  );
  assert.equal(shouldCloseNotification("neuroplan:old", "neuroplan:new"), true);
  assert.equal(shouldCloseNotification("neuroplan:old", null), true);
  assert.equal(shouldCloseNotification("another-app", null), false);
});

test("notifica recomendação pendente com permissão e API disponível, inclusive com a aba visível", () => {
  const key = notificationKey(1, session);
  const input = {
    key,
    permission: "granted",
    offline: false,
    alreadySent: false,
  };
  assert.equal(shouldNotify(input), true);
  for (const override of [
    { permission: "denied" },
    { permission: "default" },
    { offline: true },
    { alreadySent: true },
    { key: null },
  ]) {
    assert.equal(shouldNotify({ ...input, ...override }), false);
  }
  assert.equal(notificationKey(1, null), null);
  assert.equal(
    notificationKey(1, { ...session, finalizada_em: "2026-10-06T12:00:00Z" }),
    null,
  );
  for (const estado of [
    "ADIADA",
    "EM_ANDAMENTO",
    "CONCLUIDA",
    "CANCELADA",
  ] as const) {
    assert.equal(
      notificationKey(1, {
        ...session,
        recomendacao: { ...session.recomendacao!, estado },
      }),
      null,
    );
  }
});

test("deduplicação distingue usuário, sessão, recomendação e próximo vencimento do adiamento", () => {
  const key = notificationKey(1, session);
  assert.equal(notificationKey(1, { ...session }), key);
  assert.notEqual(notificationKey(2, session), key);
  assert.notEqual(notificationKey(1, { ...session, id: "other" }), key);
  assert.notEqual(
    notificationKey(1, {
      ...session,
      recomendacao: { ...session.recomendacao!, id: 8 },
    }),
    key,
  );
  assert.notEqual(
    notificationKey(1, { ...session, adiada_ate: "2026-10-06T12:05:00Z" }),
    key,
  );
});

test("lacuna na captura não equivale a fechamento sustentado; cooldown permanece após interrupção", () => {
  const continuity = new FrameContinuity();
  const detector = new SignalDetector();
  const closed = { ear: 0.1, mar: 0.1 };
  const sample = (time: number) => {
    if (continuity.interrupted(time)) detector.reset();
    return detector.update(closed, time);
  };
  sample(0);
  sample(100);
  assert.equal(sample(5000), null);
  for (let t = 5100; t < 7500; t += 100) assert.equal(sample(t), null);
  assert.equal(sample(7500)?.tipo, "OLHOS_FECHADOS");
  assert.equal(sample(10000), null);
  for (let t = 10100; t <= 13000; t += 100) assert.equal(sample(t), null);
});

test("clique na notificação foca o NeuroPlan e solicita atualização; não aceita pausa automaticamente", async () => {
  const handlers: Record<string, (event: unknown) => void> = {};
  const calls: string[] = [];
  const client = {
    url: "https://neuroplan.example/",
    focus: async () => {
      calls.push("focus");
    },
    postMessage: (message: { type: string }) => {
      calls.push(message.type);
    },
  };
  const context = {
    URL,
    self: {
      location: { origin: "https://neuroplan.example" },
      addEventListener: (name: string, fn: (event: unknown) => void) => {
        handlers[name] = fn;
      },
      clients: {
        matchAll: async () => [client],
        openWindow: async () => {
          calls.push("open");
        },
      },
    },
  };
  vm.runInNewContext(
    readFileSync(
      new URL("../public/notifications-sw.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  let completion: Promise<void> = Promise.resolve();
  handlers.notificationclick({
    notification: { close: () => calls.push("close") },
    waitUntil: (promise: Promise<void>) => {
      completion = promise;
    },
  });
  await completion;
  assert.deepEqual(calls, ["close", "focus", "review-recommendation"]);
});
