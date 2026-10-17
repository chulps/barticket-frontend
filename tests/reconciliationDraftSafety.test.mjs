import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/reconciliationDraftSafety.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
runInNewContext(output, { module: mod, exports: mod.exports });
const { canDiscard, defaultCsvMapping } = mod.exports;
const page = readFileSync(new URL("../src/pages/Reconciliation.tsx", import.meta.url), "utf8");

test("unchanged shift draft switches without unnecessary confirmation", () => {
  let prompts = 0;
  assert.equal(canDiscard(false, () => { prompts++; return false; }), true);
  assert.equal(prompts, 0);
});

test("dirty shift draft and close can be cancelled or confirmed", () => {
  assert.equal(canDiscard(true, () => false), false);
  assert.equal(canDiscard(true, () => true), true);
  assert.match(page, /if \(!confirmDiscard\(changed\)\) return/);
  assert.match(page, /if \(confirmDiscard\(changed\)\)/);
});

test("CSV headers map deterministically after successful replacement", () => {
  const fields = defaultCsvMapping(["Shift Date", "Revenue", "Guests", "Manager", "Staff Hours"]);
  assert.equal(fields.revenue, "Revenue");
  assert.equal(fields.guests, "Guests");
  assert.equal(fields.manager, "Manager");
  assert.equal(fields.date, undefined);
});

test("malformed or oversized replacement does not wipe prior preview", () => {
  assert.match(page, /if \(file\.size > 2_000_000\)/);
  assert.match(page, /const parsed = parseCsv\(await file\.text\(\)\)/);
  assert.match(page, /setCsv\(parsed\)/);
  assert.doesNotMatch(page, /setCsv\(null\); setMapping\(\{\}\)/);
});

test("route changes and reloads preserve or warn about browser-only work", () => {
  assert.match(page, /temporaryWorkingCopy = \{ selectedId, draft, csv, mapping, includeHours \}/);
  assert.match(page, /window\.addEventListener\("beforeunload", beforeUnload\)/);
  assert.match(page, /document\.addEventListener\("click", interceptNavigation, true\)/);
  assert.match(page, /window\.addEventListener\("barticket-auth", clearOnAuthChange\)/);
});
