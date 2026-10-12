import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

// Import the actual production functions without adding a browser testing dependency.
async function loadTypeScript(path, substitutions = []) {
  let source = readFileSync(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of substitutions) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import("data:text/javascript," + encodeURIComponent(outputText));
}

const { acceptBackgroundSnapshot } = await loadTypeScript("../src/hooks/refreshSafety.ts");
const { dispatchBarTicketPush } = await loadTypeScript("../src/api/pushEvents.ts");

// Existing pure state transitions are used in the actual optimistic UI.
const { projectTicket } = await loadTypeScript("../src/hooks/optimisticTickets.ts", [
  ['import type { Ticket } from "../types/Ticket";', ""],
]);
const { dismissRestockNotice } = await loadTypeScript("../src/hooks/optimisticOperations.ts");

const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test("push-triggered ticket GET never overwrites an optimistic edit, even if it finishes after the edit", async () => {
  // These are the actual event names used by src/main.tsx and useTickets.ts.
  const hooks = readFileSync(new URL("../src/hooks/useTickets.ts", import.meta.url), "utf8");
  const boot = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  assert.match(hooks, /addEventListener\("barticket-push", onFocus\)/);
  assert.match(boot, /dispatchBarTicketPush\(event\.data, window\)/);

  const base = {
    id: 1, name: "Table 1", status: "open",
    items: [{ id: 5, type: "menu", name: "Highball", unit_price: 700, quantity: 1, subtotal: 700 }],
  };
  const staleResponse = [{ ...base, items: [{ ...base.items[0] }] }];
  const bus = new EventTarget();
  let revision = 0;
  let writing = false;
  let displayed = [base];
  let serverTicket = base;
  let nextResponse = deferred();
  const reads = [];

  bus.addEventListener("barticket-push", () => {
    if (writing) return; // The hook refuses to fetch while local writes are pending.
    const startedRevision = revision;
    reads.push(nextResponse.promise.then((incoming) => {
      const accepted = acceptBackgroundSnapshot(incoming, {
        startedRevision, currentRevision: revision, pendingWrite: writing, cancelled: false,
      });
      if (accepted !== null) displayed = accepted;
    }));
  });

  assert.equal(dispatchBarTicketPush({ type: "other-worker-message" }, bus), false);
  assert.equal(reads.length, 0);
  assert.equal(dispatchBarTicketPush({ type: "barticket-push" }, bus), true);
  assert.equal(reads.length, 1); // Push initiated the GET.

  // The user taps + while a push-triggered GET is still in flight.
  writing = true;
  revision++;
  const increase = { key: 1, transform: ticket => ({ ...ticket, items: ticket.items.map(item => ({
    ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unit_price,
  })) }) };
  displayed = [projectTicket(serverTicket, [increase])];
  assert.equal(displayed[0].items[0].quantity, 2);

  // Even a response from before the tap cannot erase it.
  nextResponse.resolve(staleResponse);
  await Promise.all(reads);
  assert.equal(displayed[0].items[0].quantity, 2);
  assert.equal(displayed[0].items[0].subtotal, 1400);

  // After the request completes, the revision still rejects the old GET.
  writing = false;
  serverTicket = { ...base, items: [{ ...base.items[0], quantity: 2, subtotal: 1400 }] };
  displayed = [serverTicket];
  assert.equal(acceptBackgroundSnapshot(staleResponse, {
    startedRevision: 0, currentRevision: revision, pendingWrite: writing, cancelled: false,
  }), null);

  nextResponse = deferred();
  dispatchBarTicketPush({ type: "barticket-push" }, bus);
  nextResponse.resolve([{ ...serverTicket, name: "Updated on another device" }]);
  await Promise.all(reads);
  assert.equal(displayed[0].name, "Updated on another device");
  assert.equal(displayed[0].items[0].quantity, 2);
});

test("push-triggered notices cannot reintroduce a notice while an optimistic restock is pending", async () => {
  const notifications = readFileSync(new URL("../src/pages/Notifications.tsx", import.meta.url), "utf8");
  assert.match(notifications, /addEventListener\("barticket-notices", load\)/);
  const initial = {
    status: "open", business_date: "2026-10-12",
    notices: [
      { id: 8, item: "Highball", by: "Staff", at: 100 },
      { id: 9, item: "Beer", by: "Staff", at: 101 },
    ],
  };
  let visible = initial;
  let revision = 0;
  let pendingRestock = false;
  let nextResponse = deferred();
  const reads = [];
  const bus = new EventTarget();

  bus.addEventListener("barticket-notices", () => {
    if (pendingRestock) return;
    const startedRevision = revision;
    reads.push(nextResponse.promise.then(incoming => {
      const accepted = acceptBackgroundSnapshot(incoming, {
        startedRevision, currentRevision: revision, pendingWrite: pendingRestock, cancelled: false,
      });
      if (accepted !== null) visible = accepted;
    }));
  });

  dispatchBarTicketPush({ type: "barticket-push" }, bus);
  assert.equal(reads.length, 1);

  // Restock immediately removes the notice in the optimistic UI.
  pendingRestock = true;
  revision++;
  visible = dismissRestockNotice(visible, 8);
  assert.deepEqual(visible.notices.map(notice => notice.id), [9]);

  // Additional push messages must not start another fetch while restocking.
  dispatchBarTicketPush({ type: "barticket-push" }, bus);
  assert.equal(reads.length, 1);
  nextResponse.resolve(initial);
  await Promise.all(reads);
  assert.deepEqual(visible.notices.map(notice => notice.id), [9]);

  // The successful backend result is authoritative; later pushes can update it.
  revision++;
  pendingRestock = false;
  const saved = dismissRestockNotice(initial, 8);
  visible = saved;
  nextResponse = deferred();
  dispatchBarTicketPush({ type: "barticket-push" }, bus);
  const updated = { ...saved, notices: [...saved.notices, { id: 10, item: "Soda", by: "Staff", at: 102 }] };
  nextResponse.resolve(updated);
  await Promise.all(reads);
  assert.deepEqual(visible.notices.map(notice => notice.id), [9, 10]);
});

test("signing out revokes the previous token's push subscription before unsubscribing the browser", async () => {
  const names = ["localStorage", "navigator", "window", "fetch", "__BARTICKET_TEST_ENV__"];
  const original = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const install = (name, value) => Object.defineProperty(globalThis, name, {
    configurable: true, writable: true, value,
  });

  const storage = new Map([["barticket_token", "old-user-token"]]);
  const request = deferred();
  const calls = [];
  let unsubscribes = 0;
  let authEvents = 0;
  let scope = "";
  const bus = new EventTarget();
  bus.addEventListener("barticket-auth", () => authEvents++);
  try {
    install("localStorage", {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key),
    });
    install("navigator", { serviceWorker: {
      getRegistration: async (path) => {
        scope = path;
        return { pushManager: { getSubscription: async () => ({
          endpoint: "https://push.example.test/device/1",
          unsubscribe: async () => { unsubscribes++; return true; },
        }) } };
      },
    } });
    install("window", bus);
    install("fetch", async (url, options) => {
      calls.push({ url, options });
      return request.promise;
    });
    install("__BARTICKET_TEST_ENV__", {
      VITE_API_URL: "https://api.example.test",
      BASE_URL: "/barticket-frontend/",
    });
    // Only replace Vite's compile-time environment reference in the test
    // import; the tested setToken and revoke implementation are unmodified.
    const { getToken, setToken } = await loadTypeScript("../src/api/client.ts", [
      ["import.meta.env.", "globalThis.__BARTICKET_TEST_ENV__."],
    ]);

    setToken(null);
    assert.equal(getToken(), null, "logout immediately clears the local token");
    assert.equal(authEvents, 1, "the app receives the sign-out event");
    await flush();
    assert.equal(scope, "/barticket-frontend/");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.example.test/push/subscriptions");
    assert.equal(calls[0].options.method, "DELETE");
    assert.equal(calls[0].options.headers.Authorization, "Bearer old-user-token");
    assert.deepEqual(JSON.parse(calls[0].options.body), { endpoint: "https://push.example.test/device/1" });
    assert.equal(unsubscribes, 0, "do not unsubscribe until the backend confirms revocation");

    request.resolve({ ok: true });
    await flush();
    assert.equal(unsubscribes, 1, "successful backend revocation unsubscribes this device");

    // Signing in again does not attempt to revoke the now-absent previous user.
    setToken("another-user-token");
    setToken("another-user-token");
    await flush();
    assert.equal(calls.length, 1);
  } finally {
    for (const name of names) {
      const descriptor = original.get(name);
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
