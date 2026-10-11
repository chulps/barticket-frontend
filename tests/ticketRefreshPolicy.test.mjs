import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Load the actual TypeScript policy module without adding a test framework.
const source = readFileSync(new URL("../src/hooks/ticketRefreshPolicy.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { ACTIVE_REFRESH_MS, IDLE_REFRESH_MS, ACTIVE_WINDOW_MS, getTicketRefreshInterval, isTicketRefreshDue } =
  await import("data:text/javascript," + encodeURIComponent(outputText));

test("active use refreshes every 10 seconds", () => {
  assert.equal(ACTIVE_REFRESH_MS, 10_000);
  assert.equal(getTicketRefreshInterval(20_000, 0), 10_000);
  assert.equal(isTicketRefreshDue(9_999, 0, 0, true), false);
  assert.equal(isTicketRefreshDue(10_000, 0, 0, true), true);
});

test("idle use switches to 60-second refreshes", () => {
  assert.equal(IDLE_REFRESH_MS, 60_000);
  assert.equal(ACTIVE_WINDOW_MS, 30_000);
  assert.equal(getTicketRefreshInterval(30_000, 0), 60_000);
  assert.equal(isTicketRefreshDue(59_999, 0, 0, true), false);
  assert.equal(isTicketRefreshDue(60_000, 0, 0, true), true);
});

test("backgrounded pages never refresh", () => {
  assert.equal(isTicketRefreshDue(120_000, 0, 0, false), false);
  assert.equal(isTicketRefreshDue(10_000, 9_000, 0, false), false);
});

test("new interaction returns the app to active timing", () => {
  assert.equal(getTicketRefreshInterval(120_000, 0), 60_000);
  assert.equal(getTicketRefreshInterval(120_000, 119_000), 10_000);
  assert.equal(isTicketRefreshDue(120_000, 119_000, 109_999, true), true);
});

test("recent refresh suppresses redundant network requests", () => {
  assert.equal(isTicketRefreshDue(100_000, 99_000, 95_000, true), false);
  assert.equal(isTicketRefreshDue(100_000, 99_000, 90_000, true), true);
});
