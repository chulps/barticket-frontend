import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const source = readFileSync(new URL('../src/components/paymentCollectionPolicy.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { isPreviousServiceDate, validCollectionConfirmation } = await import('data:text/javascript,' + encodeURIComponent(outputText));
test('only previous service nights need date review', () => {
 assert.equal(isPreviousServiceDate('2026-10-30', '2026-10-31'), true);
 assert.equal(isPreviousServiceDate('2026-10-31', '2026-10-31'), false);
});
test('requires explicit valid date and reason, never guesses receipt date', () => {
 assert.equal(validCollectionConfirmation('', 'Paid last night', '2026-10-30', '2026-10-31'), false);
 assert.equal(validCollectionConfirmation('2026-10-30', 'Paid last night', '2026-10-30', '2026-10-31'), true);
 assert.equal(validCollectionConfirmation('2026-10-31', 'Received today', '2026-10-30', '2026-10-31'), true);
 assert.equal(validCollectionConfirmation('2026-10-29', 'Bad', '2026-10-30', '2026-10-31'), false);
 assert.equal(validCollectionConfirmation('2026-11-01', 'Future', '2026-10-30', '2026-10-31'), false);
 assert.equal(validCollectionConfirmation('2026-10-30', '   ', '2026-10-30', '2026-10-31'), false);
 assert.equal(validCollectionConfirmation('2026-02-30', 'Invalid', '2026-01-01', '2026-10-31'), false);
});
test('modal keeps date blank until explicitly entered and locks retry payload', () => {
 const modal = readFileSync(new URL('../src/components/PaymentModal.tsx', import.meta.url), 'utf8');
 assert.match(modal, /\[collectionDate, setCollectionDate\] = useState\(recovered\?\.collection\?\.collection_business_date \?\? ""\)/);
 assert.match(modal, /useRef\(recovered\?\.key \?\? crypto\.randomUUID\(\)\)/);
 assert.match(modal, /disabled=\{saving \|\| attempted\}/);
 assert.match(modal, /collection_business_date: collectionDate/);
 assert.match(modal, /collection_date_reason: collectionReason.trim\(\)/);
});
