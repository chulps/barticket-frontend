import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/ticketBoardVisibility.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
runInNewContext(output, { module: mod, exports: mod.exports });
const { ticketVisibleOnBoard } = mod.exports;
const paid = { status: "paid", shiftId: 11 };
const cancelled = { status: "cancelled", shiftId: 11 };
const open = { status: "open", shiftId: 10 };
const ready = (shiftId) => ({ status: "ready", shiftId });

test("initial shift lookup and failed shift lookup hide paid and cancelled tickets", () => {
  for (const status of ["loading", "error"]) {
    assert.equal(ticketVisibleOnBoard(paid, "paid", { status, shiftId: null }), false);
    assert.equal(ticketVisibleOnBoard(cancelled, "cancelled", { status, shiftId: null }), false);
  }
});

test("failed refresh after success fails closed; retry restores only this shift", () => {
  assert.equal(ticketVisibleOnBoard(paid, "paid", ready(11)), true);
  assert.equal(ticketVisibleOnBoard(paid, "paid", { status: "error", shiftId: null }), false);
  assert.equal(ticketVisibleOnBoard(paid, "paid", ready(11)), true);
  assert.equal(ticketVisibleOnBoard(paid, "paid", ready(12)), false);
});

test("no active shift and next-night transition hide historic closed tickets", () => {
  assert.equal(ticketVisibleOnBoard(paid, "paid", ready(null)), false);
  assert.equal(ticketVisibleOnBoard(paid, "paid", ready(12)), false);
  assert.equal(ticketVisibleOnBoard(cancelled, "cancelled", ready(11)), true);
  assert.equal(ticketVisibleOnBoard(paid, "cancelled", ready(11)), false);
});

test("open ticket recovery policy remains available during lookup failure", () => {
  assert.equal(ticketVisibleOnBoard(open, "open", { status: "error", shiftId: null }), true);
});

test("dashboard exposes safe retry and does not treat unknown shift as open", () => {
  const dashboard = readFileSync(new URL("../src/pages/Dashboard.tsx", import.meta.url), "utf8");
  assert.match(dashboard, /barticket-retry-shift/);
  assert.match(dashboard, /request !== requestVersion/);
  assert.match(dashboard, /nightOpen={shiftLookup.status === "ready" && shift\?\.status === "open"}/);
  assert.doesNotMatch(dashboard, /openShiftId === undefined/);
});
