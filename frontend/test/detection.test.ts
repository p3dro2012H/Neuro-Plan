import { test } from "node:test";
import assert from "node:assert/strict";
import { SignalDetector, metrics, ear } from "../src/detection";
const open = { ear: 0.3, mar: 0.2 },
  closed = { ear: 0.15, mar: 0.2 },
  mouth = { ear: 0.3, mar: 0.8 };
test("piscadas curtas não emitem; fechamento sustentado emite uma vez", () => {
  const d = new SignalDetector();
  assert.equal(d.update(closed, 0), null);
  assert.equal(d.update(closed, 200), null);
  assert.equal(d.update(open, 300), null);
  assert.equal(d.update(closed, 1000), null);
  assert.equal(d.update(closed, 3499), null);
  assert.equal(d.update(closed, 3500)?.tipo, "OLHOS_FECHADOS");
  assert.equal(d.update(closed, 60000), null);
  d.update(open, 61000);
  d.update(closed, 62000);
  assert.equal(d.update(closed, 64500)?.tipo, "OLHOS_FECHADOS");
});
test("boca sustentada, rosto ausente, cooldown e reset preservam intervalo", () => {
  const d = new SignalDetector();
  d.update(mouth, 0);
  assert.equal(d.update(mouth, 1199), null);
  assert.equal(d.update(mouth, 1200)?.tipo, "BOCEJO");
  assert.equal(d.update(mouth, 40000), null);
  d.update(open, 41000);
  d.update(closed, 42000);
  d.update(null, 44000);
  assert.equal(d.update(closed, 46000), null);
  assert.equal(d.update(closed, 48000), null);
  assert.equal(d.update(closed, 48500)?.tipo, "OLHOS_FECHADOS");
  d.reset();
  d.update(mouth, 49000);
  assert.equal(d.update(mouth, 50200), null);
  assert.equal(d.update(mouth, 78499), null);
  assert.equal(d.update(mouth, 78500)?.tipo, "BOCEJO");
});
test("limiares exatos não emitem e dados degenerados são ignorados", () => {
  const d = new SignalDetector();
  d.update({ ear: 0.21, mar: 0.6 }, 0);
  assert.equal(d.update({ ear: 0.21, mar: 0.6 }, 10000), null);
  assert.equal(d.update({ ear: NaN, mar: 0.7 }, 11000), null);
  assert.equal(metrics([], 640, 480), null);
  const points = Array.from({ length: 468 }, () => ({ x: 0, y: 0 }));
  assert.equal(metrics(points, 640, 480), null);
  assert.equal(
    ear(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0.1 },
        { x: 1, y: 0.1 },
        { x: 1, y: 0 },
        { x: 1, y: -0.1 },
        { x: 0, y: -0.1 },
      ],
      [0, 1, 2, 3, 4, 5],
      100,
      200,
    ),
    0.4,
  );
});
