import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const manifest = JSON.parse(readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const sw = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("manifest is scoped to GitHub Pages repository and installable", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/barticket-frontend/");
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

test("preview build generates root-scoped manifest without changing source", () => {
  const dir = mkdtempSync(join(tmpdir(), "barticket-pwa-"));
  try {
    mkdirSync(join(dir, "public"));
    cpSync(new URL("../scripts/prepare-pwa.mjs", import.meta.url), join(dir, "prepare-pwa.mjs"));
    execFileSync(process.execPath, ["prepare-pwa.mjs"], { cwd: dir, env: { ...process.env, BASE_PATH: "/" } });
    const preview = JSON.parse(readFileSync(join(dir, "public/manifest.webmanifest"), "utf8"));
    assert.equal(preview.scope, "/");
    assert.equal(preview.start_url, "/");
    execFileSync(process.execPath, ["prepare-pwa.mjs"], { cwd: dir, env: { ...process.env, BASE_PATH: "/barticket-frontend/" } });
    const production = JSON.parse(readFileSync(join(dir, "public/manifest.webmanifest"), "utf8"));
    assert.equal(production.scope, "/barticket-frontend/");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
