import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = p => readFileSync(new URL('../src/pages/' + p, import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(read('paymentPlans.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { knownPaymentPlan } = await import('data:text/javascript,' + encodeURIComponent(outputText));
test('future preference is one of four paths, never a processor connection', () => {
 for (const id of ['current_jms', 'phone_square', 'linked_jms', 'advanced_stripe']) assert.equal(knownPaymentPlan(id), id);
 for (const id of [null, undefined, 'connected', 'jms', 'invalid']) assert.equal(knownPaymentPlan(id), null);
 const source = read('AdminPayments.tsx');
 assert.match(source, /provider: setup.provider, channel: setup.channel, methods: setup.methods, revision: setup.revision, payment_plan: paymentPlan/);
 assert.match(source, /Preference saved\. No provider or payment settings were changed; nothing is connected/);
});
test('comparison can render without private data and never performs payment calls', () => {
 const source = read('PaymentDecisionGuide.tsx');
 assert.doesNotMatch(source, /apiRequest|fetch\(|getToken|localStorage|\.pay\(/);
 assert.doesNotMatch(read('AdminPayments.tsx'), /customer_surcharge|internal_processing_rate_bps/);
});
