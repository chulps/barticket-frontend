import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = readFileSync(new URL("../src/components/selectorNavigation.ts", import.meta.url), "utf8");
const output = ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const mod = { exports: {} };
runInNewContext(output, { module: mod, exports: mod.exports });
const { nextSelectorIndex } = mod.exports;
const tab = readFileSync(new URL("../src/components/TabGroup.tsx", import.meta.url), "utf8");
const payment = readFileSync(new URL("../src/components/PaymentModal.tsx", import.meta.url), "utf8");

test("arrow navigation wraps and Home/End jump to edges", () => {
  assert.equal(nextSelectorIndex(2, 3, "ArrowRight"), 0);
  assert.equal(nextSelectorIndex(0, 3, "ArrowLeft"), 2);
  assert.equal(nextSelectorIndex(1, 3, "ArrowDown"), 2);
  assert.equal(nextSelectorIndex(1, 3, "ArrowUp"), 0);
  assert.equal(nextSelectorIndex(2, 3, "Home"), 0);
  assert.equal(nextSelectorIndex(0, 3, "End"), 2);
});
test("native tab, enter and space retain their normal meaning", () => {
  assert.equal(nextSelectorIndex(1, 3, "Tab"), null);
  assert.equal(nextSelectorIndex(1, 3, "Enter"), null);
  assert.equal(nextSelectorIndex(1, 3, " "), null);
  assert.equal(nextSelectorIndex(0, 0, "ArrowRight"), null);
});
test("ticket/admin tab groups and payment methods expose a single pressed button", () => {
  assert.match(tab, /role="group"/);
  assert.match(tab, /aria-pressed=\{tab\.id === activeTab\}/);
  assert.match(tab, /onKeyDown=\{event => handleArrow\(event, index\)\}/);
  assert.match(tab, /button\.getBoundingClientRect/);
  assert.match(tab, /button\.offsetLeft/);
  assert.match(tab, /overflow-x: auto/);
  assert.match(tab, /scroller\.scrollTo/);
  assert.match(tab, /prefers-reduced-motion: reduce/);
  assert.match(payment, /role="group" aria-label=\{t\("receivePayment"\)\}/);
  assert.match(payment, /aria-pressed=\{paymentType === method\.type\}/);
  assert.match(payment, /onKeyDown=\{event => handleMethodArrow\(event, index\)\}/);
});
test("all updated typescript parses", () => {
  for (const [path, source] of [["TabGroup.tsx",tab],["PaymentModal.tsx",payment]]) {
    const parsed = ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
  }
});

