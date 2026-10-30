import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/api/realtimeConnection.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
runInNewContext(output, { module: mod, exports: mod.exports });
const { createRealtimeConnection, REALTIME_SCOPES } = mod.exports;

function createHarness() {
  const sockets = [];
  const timers = [];
  const invalidations = [];
  const expired = [];
  let now = 0;
  const connection = createRealtimeConnection({
    open: () => {
      const socket = { onopen: null, onmessage: null, onerror: null, onclose: null, send() {}, close() {} };
      sockets.push(socket);
      return socket;
    },
    token: () => "signed-in-session",
    schedule: (callback, delay) => {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return () => { timer.cancelled = true; };
    },
    now: () => now,
    random: () => 0,
    invalidate: scopes => invalidations.push([...scopes]),
    expired: () => expired.push(true),
  });
  return { connection, sockets, timers, invalidations, expired, advance: value => { now = value; } };
}

test("authenticated ready and ticket invalidations refresh signed-in clients", () => {
  const h = createHarness();
  h.connection.start();
  const socket = h.sockets[0];
  socket.onopen();
  socket.onmessage({ data: JSON.stringify({ type: "ready", version: 1, cursor: 12 }) });
  socket.onmessage({ data: JSON.stringify({ type: "invalidate", version: 1, cursor: 13, scopes: ["tickets", "shift"] }) });
  assert.deepEqual(h.invalidations, [Array.from(REALTIME_SCOPES), ["tickets", "shift"]]);
  h.connection.stop();
});

test("malformed frames are ignored and polling-compatible reconnects are scheduled", () => {
  const h = createHarness();
  h.connection.start();
  const socket = h.sockets[0];
  socket.onmessage({ data: JSON.stringify({ type: "invalidate", version: 1, cursor: 1, scopes: ["drop-database"] }) });
  assert.deepEqual(h.invalidations, []);
  socket.onclose({ code: 1012 });
  const activeTimers = h.timers.filter(timer => !timer.cancelled);
  assert.equal(activeTimers.length, 1);
  assert.equal(activeTimers[0].delay, 1000);
  h.connection.stop();
});

test("expired sessions stop reconnecting and are reported to the auth owner", () => {
  const h = createHarness();
  h.connection.start();
  h.sockets[0].onclose({ code: 4401 });
  assert.deepEqual(h.expired, [true]);
  assert.equal(h.timers.filter(timer => !timer.cancelled).length, 0);
  h.connection.stop();
});

test("missing heartbeats reconnect while polling can continue", () => {
  const h = createHarness();
  h.connection.start();
  h.advance(20_000);
  h.timers[0].callback();
  const activeTimers = h.timers.filter(timer => !timer.cancelled);
  assert.equal(activeTimers.length, 1);
  assert.equal(activeTimers[0].delay, 1000);
  h.connection.stop();
});

test("the signed-in app starts realtime without using a clock-in check", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const transport = readFileSync(new URL("../src/api/realtime.ts", import.meta.url), "utf8");
  assert.match(app, /if \(authenticated !== true\) return;[\s\S]*?startRealtime\(\)/);
  assert.match(transport, /if \(getToken\(\) && navigator\.onLine !== false\) connection\.start\(\)/);
  assert.doesNotMatch(transport, /clockedIn|isClockedIn|clock_in/);
  assert.match(app, /barticket-menu-updated/);
});
