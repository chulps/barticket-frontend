import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
function setup(visible = false) {
  const handlers = {}, shown = [], messages = [], navigated = [];
  const client = { visibilityState: visible ? "visible" : "hidden", url: "https://example.com/barticket-frontend/", postMessage: data => messages.push(data), navigate: async url => navigated.push(url), focus: () => {} };
  const self = {
    addEventListener: (name, fn) => handlers[name] = fn,
    registration: { scope: "https://example.com/barticket-frontend/", showNotification: async (title, options) => shown.push({ title, ...options }) },
    location: { origin: "https://example.com" },
    clients: { matchAll: async () => [client], openWindow: async url => navigated.push(url) },
  };
  runInNewContext(worker, { self, URL, Promise });
  const push = async payload => { let pending; handlers.push({ data: { json: () => payload }, waitUntil: p => pending = p }); await pending; };
  const click = async url => { let pending; handlers.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: p => pending = p }); await pending; };
  return { shown, messages, navigated, push, click };
}

test("foreground push refreshes the app without duplicating an OS alert", async () => {
  const s = setup(true); await s.push({ type: "ticket_created", ticket_id: 42, title: "New ticket" });
  assert.equal(s.messages.length, 1); assert.equal(s.shown.length, 0);
});

test("background ticket push opens the exact ticket under the Pages base path", async () => {
  const s = setup(); await s.push({ type: "ticket_paid", ticket_id: 42 });
  assert.equal(s.shown.length, 1);
  assert.equal(s.shown[0].data.url, "https://example.com/barticket-frontend/tickets?ticket=42");
  await s.click(s.shown[0].data.url);
  assert.deepEqual(s.navigated, ["https://example.com/barticket-frontend/tickets?ticket=42"]);
});

test("stock and shift push navigate to the right screen and reject foreign tap URLs", async () => {
  const s = setup(); await s.push({ type: "stock" }); await s.push({ type: "shift_closed" });
  assert.equal(s.shown[0].data.url, "https://example.com/barticket-frontend/menu");
  assert.equal(s.shown[1].data.url, "https://example.com/barticket-frontend/profile");
  await s.click("https://evil.example/tickets"); await s.click("https://example.com/other-app/");
  assert.equal(s.navigated.length, 0);
});
