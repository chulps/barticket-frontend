import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/pages/reservationCounts.ts', import.meta.url), 'utf8');
const module = { exports: {} };
new Function('module', 'exports', ts.transpile(source, { module: ts.ModuleKind.CommonJS }))(module, module.exports);
const { reservationCounts } = module.exports;
test('pending, approved and historical records stay distinct', () => {
  assert.deepEqual(reservationCounts([{status:'pending'}, {status:'approved'}, {status:'declined'}, {status:'canceled'}]), {pending:1, approved:1, history:2});
  assert.deepEqual(reservationCounts([{status:'canceled'}]), {pending:0, approved:0, history:1});
  assert.deepEqual(reservationCounts([]), {pending:0, approved:0, history:0});
});
