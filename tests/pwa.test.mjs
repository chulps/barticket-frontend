import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("manifest is scoped to GitHub Pages repository and installable", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/barticket-frontend/tickets");
  assert.equal(manifest.scope, "/barticket-frontend/");
  assert.ok(manifest.icons.length);
});

test("worker supports push but never caches financial data", () => {
  assert.match(sw, /addEventListener\("push"/);
  assert.match(sw, /addEventListener\("notificationclick"/);
  assert.doesNotMatch(sw, /caches\.open|cache\.put|addAll\(/);
});

test("manifest and worker paths honor Vite base URL", () => {
  assert.match(index, /%BASE_URL%manifest\.webmanifest/);
});
