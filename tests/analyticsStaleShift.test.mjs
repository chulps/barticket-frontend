import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/pages/analyticsStaleShift.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {staleAnalyticsShift, formatBusinessNight} = await import('data:text/javascript,' + encodeURIComponent(output));
test('only a fully identified stale-shift conflict permits partial analytics', () => {
 const detail = {code:'STALE_OPEN_SHIFT',shift_id:514,business_date:'2026-10-30'};
 assert.deepEqual(staleAnalyticsShift({status:409,detail}), {shiftId:514,businessDate:'2026-10-30'});
 for (const error of [{status:403,detail},{status:500,detail},{status:409,detail:{...detail,code:'OTHER'}},{status:409,detail:{...detail,shift_id:0}},{status:409,detail:{...detail,business_date:'unknown'}},null]) assert.equal(staleAnalyticsShift(error),null);
});
test('daily dates expose imported year and year-end rollover in both languages', () => {
 for (const locale of ['en','ja']) {
   assert.match(formatBusinessNight('2025-11-02',locale), /2025/);
   const night = formatBusinessNight('2026-12-31',locale);
   assert.match(night,/2026/); assert.match(night,/2027/);
 }
});
