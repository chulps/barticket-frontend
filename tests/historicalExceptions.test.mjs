import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const code=readFileSync(new URL("../src/pages/HistoricalHoursExceptions.tsx",import.meta.url),"utf8");
const reconciliation=readFileSync(new URL("../src/pages/Reconciliation.tsx",import.meta.url),"utf8");
test("stored identity, provenance, unknown evidence and verification remain independent",()=>{
 for(const field of ["record.staff_name","record.business_date","record.source_file","record.source_row","record.source_column","record.uncertainty","record.verification_state"])
   assert.ok(code.includes(field));
 assert.match(code,/Not recorded\. Clock times are unknown/);
 assert.match(code,/Imported · Account unlinked/);
 assert.match(reconciliation,/row\.stored_record \? <StoredHoursEvidence/g);
 assert.match(reconciliation,/disabled=\{!canImport \|\| historyBusy\}/);
});
test("auth invalidation cancels not-yet-started load and stale reads",()=>{
 assert.match(code,/const clear = \(\) => \{\s*window\.clearTimeout\(initialLoad\); active\.current = false;/);
 assert.match(code,/epoch\.current === version && getToken\(\) === token/);
 assert.match(code,/if \(!active\.current \|\| pending\.current\) return/);
 assert.match(code,/window\.removeEventListener\("barticket-auth", clear\)/);
});
test("exception component parses without mutation calls",()=>{
 const parsed=ts.createSourceFile("HistoricalHoursExceptions.tsx",code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
 assert.doesNotMatch(code,/historicalHoursApi\.(import|reconcile)/);
});
test("mobile stored evidence is outside the narrow result column and table headers are scoped",()=>{
 assert.match(reconciliation,/evidence \? <div className="stored-evidence">\{evidence\}<\/div>/);
 assert.match(reconciliation,/> dl > div > dd/);
 assert.doesNotMatch(reconciliation,/value: <>[^\n]*StoredHoursEvidence/);
 assert.match(reconciliation,/<th scope="col">\{ja \? "現在の有効時間"/);
});
