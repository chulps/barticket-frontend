import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = (path) => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");

test("menu data failure is distinct from an empty menu and can retry", () => {
  const app = src("App.tsx");
  const menu = src("pages/Menu.tsx");
  assert.match(app, /setMenuError\(true\)/);
  assert.match(app, /setMenuError\(false\)/);
  assert.match(app, /addEventListener\("barticket-retry-menu", load\)/);
  assert.match(menu, /menuError/);
  assert.match(menu, /role="alert"/);
  assert.match(menu, /barticket-retry-menu/);
});

test("ticket screen warns when menu prices or availability may be stale", () => {
  const dash = src("pages/Dashboard.tsx");
  assert.match(dash, /menuError \?/);
  assert.match(dash, /MenuLoadWarning role="alert"/);
  assert.match(dash, /barticket-retry-menu/);
});

test("notification screen distinguishes initial load, permissions, and recoverable errors", () => {
  const notif = src("pages/Notifications.tsx");
  assert.match(notif, /const \[loading, setLoading\]/);
  assert.match(notif, /setLoadFailed\(true\)/);
  assert.match(notif, /setDenied\(true\)/);
  assert.match(notif, /role="status"/);
  assert.match(notif, /barticket-api-restored/);
});
