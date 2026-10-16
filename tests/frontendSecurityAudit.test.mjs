import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { auditFrontendSource, checkFrontendText, findPublicSourceMaps } from "../scripts/audit-frontend-security.mjs";

test("React escapes an untrusted menu/ticket name rather than rendering markup", () => {
  const payload = '<img src=x onerror="alert(1)">';
  const html = renderToStaticMarkup(createElement("span", null, payload));
  assert.ok(html.includes("&lt;img"));
  assert.equal(html.includes("<img"), false);
});

test("production frontend has no raw HTML/code injection sinks or embedded secrets", () => {
  assert.deepEqual(auditFrontendSource(process.cwd()), []);
});

test("security scanner flags injection sinks and credentials without reporting values", () => {
  const samples = [
    ["element.innerHTML = value", "untrusted HTML injection sink"],
    ["dangerouslySetInnerHTML = { __html: html }", "untrusted HTML injection sink"],
    ["eval(text)", "runtime string evaluation"],
    ["-----BEGIN PRIVATE KEY-----", "embedded private key"],
    ["ghp_" + "A".repeat(25), "embedded secret-like token"],
  ];
  for (const [value, name] of samples) {
    assert.ok(checkFrontendText(value).includes(name));
  }
  assert.deepEqual(checkFrontendText('const label = "<b>";'), []);
});

test("published source maps are detected, including nested files", () => {
  const root = mkdtempSync(join(tmpdir(), "barticket-audit-"));
  try {
    mkdirSync(join(root, "assets"));
    assert.deepEqual(findPublicSourceMaps(root), []);
    writeFileSync(join(root, "assets", "app.js.map"), "{}");
    assert.equal(findPublicSourceMaps(root).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
