import { test } from "node:test";
import assert from "node:assert/strict";
import { fromZonedInput, zonedInput } from "../src/planning-time";
test("datas preservam o instante e usam o fuso escolhido", () => {
  assert.equal(
    zonedInput("2026-10-06T13:00:00Z", "America/Sao_Paulo"),
    "2026-10-06T10:00",
  );
  assert.equal(
    fromZonedInput("2026-10-06T10:00", "America/Sao_Paulo"),
    "2026-10-06T13:00:00.000Z",
  );
  assert.equal(
    fromZonedInput("2026-10-07T01:00", "Asia/Tokyo"),
    "2026-10-06T16:00:00.000Z",
  );
  assert.throws(
    () => fromZonedInput("2026-03-08T02:30", "America/New_York"),
    /não existe/,
  );
  assert.throws(() => fromZonedInput("invalido", "UTC"));
});
