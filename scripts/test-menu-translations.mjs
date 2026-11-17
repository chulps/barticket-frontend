import assert from 'node:assert/strict';
import ts from 'typescript';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync('.menu-translation-test-');
try {
for (const name of ['index', 'translations']) {
    const source = readFileSync(`src/i18n/${name}.ts`, 'utf8').replace('from "./translations"', 'from "./translations.mjs"');
    writeFileSync(`${dir}/${name}.mjs`, ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const { menuLabel, menuHaystack, registerMenuTranslations } = await import(pathToFileURL(`${process.cwd()}/${dir}/index.mjs`));
assert.equal(menuLabel('ja', 'Yamazaki set'), '山崎セット');
assert.equal(menuLabel('en', '山崎セット'), 'Yamazaki set');
registerMenuTranslations([{menuTranslations: {'特製セット': {ja:'特製セット', en:'Special set'}, 'Tea':{en:'Tea',ja:'お茶'}}}]);
assert.equal(menuLabel('en', '特製セット'), 'Special set');
assert.equal(menuLabel('ja', 'Tea'), 'お茶');
assert.ok(menuHaystack('特製セット').includes('Special set'));
assert.equal(menuLabel('en', 'Untranslated'), 'Untranslated');
assert.equal(menuLabel('ja', 'constructor'), 'constructor');
registerMenuTranslations([{menuTranslations: {'Tea':{en:'Tea',ja:'紅茶'}}}]);
assert.equal(menuLabel('ja', 'Tea'), 'お茶'); // Reviewed catalog beats machine copy.
registerMenuTranslations([{menuTranslations: {'Test drink':{en:'Test drink',ja:'テスト'}}}]);
assert.equal(menuLabel('ja', 'Test drink'), 'テスト');
registerMenuTranslations([{menuTranslations: {'Test drink':{en:'Test drink',ja:'テスト改'}}}]);
assert.equal(menuLabel('ja', 'Test drink'), 'テスト改');
console.log('Menu label/search tests passed (bidirectional, fallback, refreshed edits).');

} finally { rmSync(dir, {recursive:true, force:true}); }
