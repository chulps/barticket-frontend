import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function src(path) { return readFileSync(new URL("../src/" + path, import.meta.url), "utf8"); }

test("API connectivity state changes only once per transition and announces restoration", () => {
  const input = src("api/connectionStatus.ts");
  const { outputText } = ts.transpileModule(input, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const events = [];
  const mod = { exports: {} };
  class FakeEvent { constructor(type) { this.type = type; } }
  runInNewContext(outputText, {
    module: mod, exports: mod.exports,
    Event: FakeEvent,
    window: { dispatchEvent: e => events.push(e.type) },
  });
  const { isApiAvailable, noteApiAvailability } = mod.exports;
  assert.equal(isApiAvailable(), true);
  noteApiAvailability(false);
  noteApiAvailability(false);
  assert.equal(isApiAvailable(), false);
  assert.deepEqual(events, ["barticket-api-status"]);
  noteApiAvailability(true);
  noteApiAvailability(true);
  assert.equal(isApiAvailable(), true);
  assert.deepEqual(events, ["barticket-api-status", "barticket-api-status", "barticket-api-restored"]);
});

test("API requests flag failed network and 5xx responses, not auth errors", () => {
  const client = src("api/client.ts");
  assert.match(client, /noteApiAvailability\(false\)/);
  assert.match(client, /noteApiAvailability\(res\.status < 500\)/);
  assert.match(client, /throw error;/);
  assert.equal((client.match(/\bawait fetch\(/g) ?? []).length, 1);
});

test("offline message and recovery refresh are connected to ticket and analytics screens", () => {
  const app = src("App.tsx");
  assert.match(app, /role="status" aria-live="polite"/);
  assert.match(app, /barticket-api-restored/);
  assert.match(src("hooks/useTickets.ts"), /addEventListener\("barticket-api-restored", onFocus\)/);
  assert.match(src("pages/Dashboard.tsx"), /addEventListener\("barticket-api-restored", load\)/);
  assert.match(src("pages/Analytics.tsx"), /addEventListener\("barticket-api-restored", refresh\)/);
  assert.match(app, /addEventListener\("online", load\)/);
});
