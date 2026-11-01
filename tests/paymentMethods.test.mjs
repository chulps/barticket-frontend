import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const read = p => readFileSync(new URL('../src/' + p, import.meta.url), 'utf8');
function load(source, require = () => ({})) {
 const mod = { exports: {} };
 runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: mod.exports, module: mod, require });
 return mod.exports;
}
const translations = load(read('i18n/translations.ts'));
const methods = load(read('components/paymentMethods.ts'), () => translations);
test('four canonical methods have exact English and Japanese labels', () => {
 assert.deepEqual([...methods.paymentMethodTypes], ['cash', 'card', 'paypay', 'other']);
 assert.deepEqual(methods.paymentMethodTypes.map(m => methods.paymentMethodLabel(m, 'en')).join('|'), 'Cash|Credit card|PayPay|Other');
 assert.equal(methods.paymentMethodLabel('card', 'ja'), 'クレジットカード');
 assert.equal(methods.paymentMethodLabel('paypay', 'ja'), 'PayPay');
});
test('unknown historical methods display Other without rewriting source records', () => {
 const record = { type: 'legacy_terminal' };
 assert.equal(methods.paymentMethodLabel(record.type, 'en'), 'Other');
 assert.equal(methods.paymentMethodLabel(record.type, 'ja'), 'その他');
 assert.equal(record.type, 'legacy_terminal');
});
test('payment dialog adds PayPay and uses shared request type; aggregate labels remain explicit', () => {
 assert.match(read('components/PaymentModal.tsx'), /type: "paypay"/);
 assert.doesNotMatch(read('components/PaymentModal.tsx'), /type PaymentType =/);
 assert.match(read('pages/Analytics.tsx'), /t\("paypayAndOther"\)/);
 assert.equal(translations.translations.en.paypayAndOther, 'PayPay / other');
});
