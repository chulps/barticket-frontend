import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const read = path => readFileSync(new URL('../src/pages/' + path, import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(read('terminalModels.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const models = await import('data:text/javascript,' + encodeURIComponent(outputText));
test('official hardware names stay distinct from connection variants', () => {
 assert.deepEqual(models.terminalModels.map(m => m.id), ['unknown', 'vega3000_mx', 'vega3000_countertop', 'vega3000_mobile2', 'saturn1000f2', 'other']);
 assert.equal(models.knownTerminalModel(null), 'unknown'); assert.equal(models.knownTerminalModel('vega3000_mx_wifi'), 'unknown');
 assert.equal(models.knownTerminalConnection(undefined), 'unknown');
 assert.equal(models.terminalConnections[0].id, 'unknown');
});
test('generic guide cannot fetch private settings, mutate or claim a connection', () => {
 const guide = read('TerminalIdentificationGuide.tsx');
 assert.doesNotMatch(guide, /apiRequest|fetch\(|getToken|onClick|secret_key/);
 assert.match(guide, /not connected/); assert.match(guide, /appearance alone/);
 assert.match(guide, /merchant numbers, terminal IDs/);
 const ui = read('AdminPayments.tsx');
 assert.match(ui, /provider: setup.provider, channel: setup.channel, methods: setup.methods/);
 assert.match(ui, /terminal_connection: terminalConnection/);
 assert.doesNotMatch(ui, /internal_processing_rate_bps|customer_surcharge/);
});
