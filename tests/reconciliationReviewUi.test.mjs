import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const code=readFileSync(new URL("../src/pages/Reconciliation.tsx",import.meta.url),"utf8");
test("CSV preview can filter only new, conflicting or matched rows",()=>{
  assert.match(code,/previewFilter === "all" \|\| row\.state === previewFilter/);
  assert.match(code,/aria-pressed=\{previewFilter === key\}/);
  assert.match(code,/previewRows\.map/);
});
test("comparison JSON carries read-only provenance, not invented punches",()=>{
  assert.match(code,/READ_ONLY_COMPARISON_NOT_IMPORTED/);
  assert.match(code,/source_line: imported\.line/);
  assert.match(code,/staff_hours_total: imported\.staffHours/);
  assert.match(code,/navigator\.clipboard\.writeText/);
  assert.match(code,/Commit import — unavailable/);
});
test("reconciliation UI parses",()=>{
  const parsed=ts.createSourceFile("Reconciliation.tsx",code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
});
