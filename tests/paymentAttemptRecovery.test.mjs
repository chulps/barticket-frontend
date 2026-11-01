import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/components/paymentAttemptRecovery.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { createPaymentAttemptRecovery, matchesPaymentAttempt, verifiedRemainingBalance } = await import('data:text/javascript,' + encodeURIComponent(outputText));
const intent = {key:'fixture-key', method:'cash', amount:300, collection:{collection_business_date:'2026-10-31', collection_date_reason:'Fixture receipt'}};
for (const method of ['cash', 'card', 'paypay', 'other']) test(`recovery preserves exact ${method} manual method across uncertainty`, () => {
 const store=createPaymentAttemptRecovery();
 const first=store.remember(11,{...intent,method});store.markUncertain(first);
 assert.equal(store.remember(11,{...intent,method:method==='cash'?'paypay':'cash',key:'replacement'}),first);
 assert.equal(store.wasUncertain(first),true);
 assert.equal(matchesPaymentAttempt(first,intent.key,method,300,intent.collection),true);
 assert.equal(matchesPaymentAttempt(first,intent.key,method==='cash'?'paypay':'cash',300,intent.collection),false);
 assert.equal(first.method,method);store.complete(11,first);assert.equal(store.get(11),undefined);
});
test('close/reopen retains immutable exact intent; neither changed amount nor another ticket reuses it', () => {
 const store=createPaymentAttemptRecovery();
 const first=store.remember(11,intent);
 assert.equal(store.get(11), first); assert.equal(store.get(12), undefined);
 assert.equal(store.remember(11,{...intent,key:'new',amount:700}),first);
 assert.throws(()=>{first.amount=700;},TypeError);
 assert.throws(()=>{first.collection.collection_date_reason='changed';},TypeError);
 assert.equal(matchesPaymentAttempt(first,intent.key,'cash',300,intent.collection),true);
 for(const [key,method,amount,collection] of [['new','cash',300,intent.collection],[intent.key,'card',300,intent.collection],[intent.key,'cash',700,intent.collection],[intent.key,'cash',300,undefined]]) {
  assert.equal(matchesPaymentAttempt(first,key,method,amount,collection),false);
 }
});
test('success clears only its own attempt; session teardown defeats stale success and cross-account reuse',()=>{
 const store=createPaymentAttemptRecovery();const old=store.remember(11,intent);
 store.clear();assert.equal(store.isCurrent(11,old),false);assert.equal(store.get(11),undefined);
 const next=store.remember(11,{...intent,key:'next-session'});
 store.complete(11,old);assert.equal(store.get(11),next);
 store.complete(11,next);assert.equal(store.get(11),undefined);
});
test('bounded unresolved attempts are never silently evicted',()=>{
 const store=createPaymentAttemptRecovery(1);const first=store.remember(11,intent);
 assert.equal(store.remember(12,intent),null);assert.equal(store.get(11),first);
 store.complete(11,first);assert.ok(store.remember(12,intent));
});
test('remaining balance is only authoritative nonnegative integer response data',()=>{
 for(const balanceDue of [400,0,200]) assert.equal(verifiedRemainingBalance({balanceDue}),balanceDue);
 for(const balanceDue of [undefined,null,-1,NaN,Infinity,0.5,'0']) assert.equal(verifiedRemainingBalance({balanceDue}),null);
});
test('all modal close paths share synchronous pending guard and session memory clears on auth',()=>{
 const modal=readFileSync(new URL('../src/components/PaymentModal.tsx',import.meta.url),'utf8');
 assert.match(modal,/registerCloseGuard\(\(\) =>/);assert.match(modal,/if \(pending.current\) return false/);
 assert.match(modal,/onConfirm\(attempt.method, attempt.amount, attempt.key, attempt.collection\)/);
 assert.match(modal,/paymentAttemptRecovery.isCurrent/);assert.match(source,/"barticket-auth", paymentAttemptRecovery.clear/);
 assert.doesNotMatch(source,/localStorage|sessionStorage/);
 assert.match(modal,/verifiedRemainingBalance\(receipt\) === 0/);
 assert.doesNotMatch(modal,/t\("paymentComplete"\)/);
});
