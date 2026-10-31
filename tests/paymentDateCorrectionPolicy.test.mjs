import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const dependency = 'data:text/javascript,' + encodeURIComponent(compile('../src/components/paymentCollectionPolicy.ts'));
const source = compile('../src/components/paymentDateCorrectionPolicy.ts').replace('"./paymentCollectionPolicy"', JSON.stringify(dependency));
const { correctionRequest, correctionAudit } = await import('data:text/javascript,' + encodeURIComponent(source));
const payment = { id: 115, collection_business_date: '2026-10-31', collection_shift_id: 515, voided_at: null };
const request = (row = payment, date = '2026-10-30', reason = '  Confirmed prior-night receipt  ', service = '2026-10-30') => correctionRequest(row, date, reason, service, '2026-10-31');
test('correction preserves exact reviewed date and shift preconditions, trimming reason', () => {
 assert.deepEqual(request(), { collection_business_date: '2026-10-30', expected_collection_business_date: '2026-10-31', expected_collection_shift_id: 515, reason: 'Confirmed prior-night receipt' });
 assert.deepEqual(request({ ...payment, collection_business_date: null, collection_shift_id: null }), { collection_business_date: '2026-10-30', expected_collection_business_date: null, expected_collection_shift_id: null, reason: 'Confirmed prior-night receipt' });
});
test('refuses missing linkage, invalid identifiers, voided rows and missing service date', () => {
 for (const row of [{ ...payment, id: undefined }, { ...payment, id: -1 }, { ...payment, id: 0 }, { ...payment, collection_shift_id: undefined }, { ...payment, collection_business_date: undefined }, { ...payment, voided_at: 123 }]) assert.equal(request(row), null);
 assert.equal(correctionRequest(payment, '2026-10-30', 'Reason', undefined, '2026-10-31'), null);
});
test('requires changed valid bounded date and substantive reason', () => {
 for (const date of ['', '2026-10-31', '2026-10-29', '2026-11-01', '2026-02-30']) assert.equal(request(payment, date), null);
 assert.equal(request(payment, '2026-10-30', '   '), null);
 assert.equal(request(payment, '2026-10-30', 'x'.repeat(256)), null);
});
test('audit parser exposes only structured correction dates and safely rejects malformed notes', () => {
 assert.deepEqual(correctionAudit(JSON.stringify({ payment_id:115, before:{collection_business_date:null}, after:{collection_business_date:'2026-10-30'} })), {paymentId:115,before:null,after:'2026-10-30'});
 for (const note of [null, '', '{}', 'null', '<script>', JSON.stringify({payment_id:-1,before:{collection_business_date:null},after:{collection_business_date:'2026-10-30'}})]) assert.equal(correctionAudit(note), null);
});
test('dialog freezes attempt key/payload and guards auth, concurrent clicks and stale review', () => {
 const component = readFileSync(new URL('../src/components/PaymentDateHistory.tsx', import.meta.url), 'utf8');
 assert.match(component, /const next = attempt \?\? \{ key: crypto.randomUUID\(\), body: body! \}/);
 assert.match(component, /if \(inFlight.current \|\| blocked/);
 assert.match(component, /token.current !== getToken\(\)/);
 assert.match(component, /account.role !== "manager"/);
 assert.match(component, /err.status === 409/);
 assert.match(component, /setAttempt\(null\)/);
 assert.match(component, /registerCloseGuard/);
 assert.match(component, /timeZone: "Asia\/Tokyo"/);
});
