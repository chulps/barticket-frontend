import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServerStyleSheet } from "styled-components";
import ts from "typescript";

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");
const component = read("components/RequestState.tsx");
function requestState(locale) {
  const output = ts.transpileModule(component, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const exports = {};
  new Function("require", "exports", output)(name =>
    name === "../i18n" ? { useI18n: () => ({ locale }) } : require(name), exports);
  return exports.default;
}

for (const locale of ["en", "ja"]) for (const kind of ["loading", "empty", "forbidden", "offline", "error", "failed-save"]) {
  for (const compact of [false, true]) test(`RequestState emits valid styled CSS: ${locale}/${kind}/${compact}`, () => {
    const sheet = new ServerStyleSheet();
    try {
      const html = renderToStaticMarkup(sheet.collectStyles(createElement(requestState(locale), {
        kind, compact, onRetry: () => {},
      })));
      const css = sheet.getStyleTags();
      const warning = !["loading", "empty"].includes(kind);
      assert.ok(css.includes(`padding:var(--space-${compact ? 1 : 2});`), css);
      assert.ok(css.includes(`border:1px solid var(--${warning ? "danger-500" : "neutral-700"});`), css);
      assert.doesNotMatch(css, /=>|\$compact|\$warning/);
      assert.match(html, new RegExp(`role="${warning ? "alert" : "status"}"`));
      assert.equal(html.includes("<button"), kind !== "loading");
    } finally { sheet.seal(); }
  });
}

test("native auth submit retains a synchronous single-operation guard and autofill semantics", () => {
  const source = read("pages/Profile.tsx");
  assert.match(source, /<Section as="form" aria-busy=\{busy\} onSubmit=/);
  assert.match(source, /event.preventDefault\(\)/);
  assert.match(source, /if \(busyRef.current\) return;\s+busyRef.current = true;/);
  assert.match(source, /finally \{\s+busyRef.current = false;/);
  assert.match(source, /type="submit" disabled=\{busy\}/);
  assert.match(source, /type="email" name="email" autoComplete=\{hasAccounts \? "username" : "email"\} required/);
  assert.match(source, /autoComplete=\{hasAccounts \? "current-password" : "new-password"\}/);
  assert.match(source, /name="name" autoComplete="name" required/);
});

test("contrast changes retain success/warning palette and explicit paired card tokens", () => {
  const css = read("index.css");
  assert.match(css, /--success-500: #1eca6b;/);
  assert.match(css, /--warning-500: #/);
  for (const name of ["Profile", "Admin"]) {
    const source = read(`pages/${name}.tsx`);
    assert.match(source, /background: var\(--surface-card\);\s+color: var\(--on-surface-card\);/);
  }
});
