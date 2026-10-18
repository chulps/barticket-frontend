import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const source = readFileSync(new URL("../src/api/realtimeConnection.ts", import.meta.url), "utf8");
const mod = { exports: {} };
runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports });
const { createRealtimeConnection } = mod.exports;
const plain = x => JSON.parse(JSON.stringify(x));
function setup() {
  let now = 0, token = "session-one", next = 0;
  const timers = new Map(), sockets = [], health = [], invalidations = [];
  let expired = 0;
  const client = createRealtimeConnection({
    open: () => { const ws = { sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() { this.closed = true; }, message(data) { this.onmessage?.({ data: JSON.stringify(data) }); } }; sockets.push(ws); return ws; },
    token: () => token, now: () => now, random: () => 0,
    schedule: (fn, delay) => { const id = ++next; timers.set(id, { fn, at: now + delay }); return () => timers.delete(id); },
    health: value => health.push(value), invalidate: scopes => invalidations.push(plain(scopes)), expired: () => expired++,
  });
  const advance = ms => { const end = now + ms; for (;;) { const entry = [...timers].sort((a,b) => a[1].at - b[1].at)[0]; if (!entry || entry[1].at > end) break; now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); } now = end; };
  const ready = (cursor = 0) => { const ws = sockets.at(-1); ws.onopen(); ws.message({ type: "ready", version: 1, cursor }); return ws; };
  return { client, sockets, health, invalidations, advance, ready, setToken: value => token = value, get expired() { return expired; } };
}

test("socket opening alone cannot stop fallback; authenticated ready refreshes every scope", () => {
  const s = setup(); s.client.start();
  assert.equal(s.client.healthy(), false);
  const ws = s.ready(10);
  assert.equal(s.client.healthy(), true);
  assert.deepEqual(plain(ws.sent), [{ type: "authenticate", token: "session-one" }]);
  assert.deepEqual(s.invalidations[0], ["tickets", "menu", "shift", "notices", "analytics", "users", "session"]);
});

test("broken socket resumes fallback and reconnect snapshots catch missed events", () => {
  const s = setup(); s.client.start(); const ws = s.ready();
  ws.onclose({ code: 1006 });
  assert.equal(s.client.healthy(), false);
  s.advance(999); assert.equal(s.sockets.length, 1);
  s.advance(1); assert.equal(s.sockets.length, 2);
  s.ready(50); assert.equal(s.invalidations.length, 2);
  assert.deepEqual(s.health, [true, false, true]);
});

test("a silent half-open connection loses health after the watchdog deadline", () => {
  const s = setup(); s.client.start(); const ws = s.ready();
  s.advance(15000); assert.equal(s.client.healthy(), false); assert.equal(ws.closed, true);
  s.advance(1000); assert.equal(s.sockets.length, 2);
});

test("heartbeats sustain health; duplicate, invalid and backward events do not refresh data", () => {
  const s = setup(); s.client.start(); const ws = s.ready(1);
  ws.message({ type: "invalidate", version: 1, cursor: 2, scopes: ["tickets"] });
  ws.message({ type: "invalidate", version: 1, cursor: 2, scopes: ["tickets"] });
  ws.message({ type: "invalidate", version: 1, cursor: 1, scopes: ["menu"] });
  ws.message({ type: "invalidate", version: 1, cursor: 3, scopes: ["secrets"] });
  assert.deepEqual(s.invalidations.at(-1), ["tickets"]);
  assert.equal(s.invalidations.length, 2);
  s.advance(10000); ws.message({ type: "heartbeat", version: 1, cursor: 2, scopes: [] });
  s.advance(10000); assert.equal(s.client.healthy(), true);
});

test("logout/account switch ignores frames from the previous socket and cancels retry", () => {
  const s = setup(); s.client.start(); const ws = s.ready(); const oldMessage = ws.onmessage;
  s.client.stop(); s.setToken("session-two"); s.client.start();
  oldMessage({ data: JSON.stringify({ type: "invalidate", version: 1, cursor: 5, scopes: ["tickets"] }) });
  assert.equal(s.invalidations.length, 1);
  const next = s.ready(); assert.equal(next.sent[0].token, "session-two");
  s.client.stop(); s.advance(60000); assert.equal(s.sockets.length, 2);
});

test("revoked authentication closes the channel and asks the app to revalidate the session", () => {
  const s = setup(); s.client.start(); const ws = s.ready();
  ws.onclose({ code: 4401 }); assert.equal(s.expired, 1); assert.equal(s.client.healthy(), false);
  s.advance(60000); assert.equal(s.sockets.length, 1);
});

test("missing handshake and unsupported protocol never establish health", () => {
  const s = setup(); s.client.start(); const ws = s.sockets[0];
  ws.onopen(); ws.message({ type: "ready", version: 99, cursor: 0 });
  assert.equal(s.client.healthy(), false);
  s.advance(15000); assert.equal(ws.closed, true);
});
