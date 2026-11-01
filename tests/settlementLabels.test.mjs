import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source=readFileSync(new URL('../src/components/settlementLabels.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}});
const {settlementLabel,unpaidReasonLabel}=await import('data:text/javascript,'+encodeURIComponent(outputText));
test('ticket and receivables labels are human-readable in English and Japanese',()=>{
 assert.equal(settlementLabel('partially_paid',false),'Partially collected');
 assert.equal(settlementLabel('partially_paid',true),'一部回収');
 assert.equal(unpaidReasonLabel('pay_later',false),'Agreed to pay later');
 assert.equal(unpaidReasonLabel('pay_later',true),'後払いの合意');
 assert.equal(unpaidReasonLabel(null,true),'—');
 assert.equal(settlementLabel('new_status',true),'状態未確認');
});
