import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isValidProductionApiUrl } from "../scripts/validate-api-url.mjs";

test("production build permits only configured HTTPS API origins", () => {
  assert.equal(isValidProductionApiUrl("https://bar-ticket-api-taupe.vercel.app"), true);
  assert.equal(isValidProductionApiUrl("https://bar-ticket-api-taupe.vercel.app/"), true);
  for (const value of [undefined, "", "http://localhost:8000", "https://localhost", "https://127.0.0.1",
    "https://example.com/path", "https://example.com?token=abc", "https://user:password@example.com",
    "javascript:alert(1)", " https://example.com", "https://example.com#frag"]) {
    assert.equal(isValidProductionApiUrl(value), false, String(value));
  }
});

test("validator rejects missing configuration without revealing an invalid value", () => {
  const secretLike = "https://example.com/?token=do-not-print";
  const run = spawnSync(process.execPath, ["scripts/validate-api-url.mjs"], {
    env: { ...process.env, VITE_API_URL: secretLike }, encoding: "utf8",
  });
  assert.equal(run.status, 1);
  assert.equal((run.stdout + run.stderr).includes(secretLike), false);
});

test("workflow validates the public variable-sourced API origin before building", () => {
  const workflow = readFileSync(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/api/client.ts", import.meta.url), "utf8");
  assert.ok(workflow.indexOf("node scripts/validate-api-url.mjs") < workflow.indexOf("npm run build"));
  assert.match(workflow, /VITE_API_URL: \$\{\{ vars\.VITE_API_URL \}\}/);
  assert.match(client, /import\.meta\.env\.PROD && !configuredApiUrl/);
});
