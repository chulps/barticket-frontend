import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/hooks/singleFlightRefresh.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
runInNewContext(output, { module: mod, exports: mod.exports });
const { createSingleFlightRefresh } = mod.exports;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
const make = () => {
  let revision = 0;
  const requests = [];
  const applied = [];
  const errors = [];
  let settled = 0;
  const reader = createSingleFlightRefresh({
    read: () => { const pending = deferred(); requests.push(pending); return pending.promise; },
    currentRevision: () => revision,
    onSnapshot: value => applied.push(value),
    onError: error => errors.push(error.message),
    onSettled: () => settled++,
  });
  return { reader, requests, applied, errors, get settled() { return settled; }, bump: () => revision++ };
};

test("parallel polling and explicit retries coalesce to one outstanding GET", async () => {
  const a = make();
  a.reader.request(); a.reader.request(); a.reader.request();
  await flush();
  assert.equal(a.requests.length, 1);
  a.requests[0].resolve("old");
  await flush();
  assert.equal(a.requests.length, 2);
  a.requests[1].resolve("new");
  await flush();
  assert.deepEqual(a.applied, ["old", "new"]);
  assert.equal(a.settled, 2);
});

test("an older read cannot overwrite a newer queued snapshot", async () => {
  const a = make();
  a.reader.request();
  await flush();
  a.reader.request();
  a.bump(); // An optimistic stock or price mutation starts before old response
  a.requests[0].resolve("stale menu");
  await flush();
  assert.deepEqual(a.applied, []);
  a.requests[1].resolve("new menu");
  await flush();
  assert.deepEqual(a.applied, ["new menu"]);
});

test("stale errors are ignored after a write; restoration clears the real error", async () => {
  const a = make();
  a.reader.request();
  await flush();
  a.reader.request();
  a.bump(); // Local write invalidates old read and old error
  a.requests[0].reject(new Error("stale outage"));
  await flush();
  assert.deepEqual(a.errors, []);
  a.requests[1].reject(new Error("actual outage"));
  await flush();
  assert.deepEqual(a.errors, ["actual outage"]);
  a.reader.request();
  await flush();
  a.requests[2].resolve("restored");
  await flush();
  assert.deepEqual(a.applied, ["restored"]);
});

test("writes during GETs reject stale snapshots and disposal ignores late responses", async () => {
  const a = make();
  a.reader.request();
  await flush();
  a.bump();
  a.requests[0].resolve("old stock");
  await flush();
  assert.deepEqual(a.applied, []);
  a.reader.request();
  await flush();
  a.reader.dispose();
  a.requests[1].resolve("after unmount");
  await flush();
  assert.deepEqual(a.applied, []);
  assert.equal(a.settled, 1);
});

test("App uses serialized refresh and preserves optimistic reconciliation", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /createSingleFlightRefresh/);
  assert.match(app, /reconcileMenuSnapshot\(data, menuRef\.current, pendingMenuItems\.current\)/);
  assert.match(app, /reader\.dispose\(\)/);
});
