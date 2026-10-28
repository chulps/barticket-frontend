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
  assert.match(code,/Save selected hours/);
  assert.match(code,/historicalHoursApi\.reconcile/);
  assert.match(code,/historicalHoursApi\.import/);
  assert.match(code,/source_column/);
  assert.match(code,/correction_reason: historyCorrectionReason\.trim\(\)/);
  assert.match(code,/Original clock timestamps are preserved/);
});
test("manager values are separated by source and the report comparison starts collapsed",()=>{
  assert.match(code,/Manager \(spreadsheet\)/);
  assert.match(code,/Manager \(BarTicket\)/);
  assert.match(code,/Manager records differ/);
  assert.match(code,/does not indicate two managers were assigned to that day/);
  assert.doesNotMatch(code,/Nori\s*←\s*Chuck/);
  assert.match(code,/<details>\s*<summary>\{ja \? "営業日レポート比較/);
});
test("staff-hours mapping preserves the original staff and total-hours columns",()=>{
  assert.match(code,/Historical staff-hours columns/);
  assert.match(code,/Daily report comparison \(read-only\)/);
  assert.match(code,/source_row/);
  assert.match(code,/source_column/);
  assert.match(code,/Rows with blank hours are skipped/);
});
test("reconciliation UI parses",()=>{
  const parsed=ts.createSourceFile("Reconciliation.tsx",code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
});
