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
  const health = [];
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
    health: ready => health.push(ready),
  });
  return { connection, sockets, timers, invalidations, expired, health, advance: value => { now = value; } };
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
  assert.match(transport, /if \(getToken\(\) && navigator\.onLine !== false && document\.visibilityState !== "hidden"\) connection\.start\(\)/);
  assert.doesNotMatch(transport, /clockedIn|isClockedIn|clock_in/);
  assert.match(app, /barticket-menu-updated/);
});


test("two independent clients become healthy only after ready and catch up after missed heartbeat", () => {
  const clients = [createHarness(), createHarness()];
  for (const h of clients) {
    h.connection.start();
    h.sockets[0].onopen();
    h.sockets[0].onmessage({data: JSON.stringify({type:"heartbeat",version:1,cursor:1,scopes:[]})});
    assert.deepEqual(h.health, []);
    h.sockets[0].onmessage({data: JSON.stringify({type:"ready",version:1,cursor:1})});
    assert.deepEqual(h.health, [true]);
    h.sockets[0].onmessage({data: JSON.stringify({type:"invalidate",version:1,cursor:2,scopes:["tickets","menu"]})});
    assert.deepEqual(h.invalidations.at(-1), ["tickets","menu"]);
  }
  const first = clients[0];
  first.advance(20_000);
  first.timers.find(t => !t.cancelled).callback();
  assert.deepEqual(first.health, [true,false]);
  assert.deepEqual(clients[1].health, [true]);
  first.timers.findLast(t => !t.cancelled).callback();
  first.sockets[1].onmessage({data:JSON.stringify({type:"ready",version:1,cursor:8})});
  assert.deepEqual(first.health, [true,false,true]);
  assert.deepEqual(first.invalidations.at(-1), Array.from(REALTIME_SCOPES));
  clients.forEach(h => h.connection.stop());
});


test('activity is capability-negotiated and separate from ordinary invalidations',()=>{
 let sent;const frames=[],scopes=[];
 const socket={onopen:null,onmessage:null,onerror:null,onclose:null,send:value=>{sent=JSON.parse(value)},close(){}};
 const connection=createRealtimeConnection({open:()=>socket,token:()=> 'fixture',schedule:()=>()=>{},now:()=>0,random:()=>0,invalidate:value=>scopes.push(value),expired(){},activity:value=>frames.push(value)});
 connection.start();socket.onopen();assert.deepEqual(sent.capabilities,['activity']);
 const frame={type:'activity',version:1,cursor:2,shift_id:4,reset:true,items:[],has_more:false};
 socket.onmessage({data:JSON.stringify(frame)});assert.equal(frames.length,0);
 socket.onmessage({data:JSON.stringify({type:'ready',version:1,cursor:1})});const before=scopes.length;
 socket.onmessage({data:JSON.stringify(frame)});assert.equal(frames.length,1);assert.equal(scopes.length,before);
 connection.stop();
});
