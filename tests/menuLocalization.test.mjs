import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");
const translationsSource = read("i18n/translations.ts");
const { outputText } = ts.transpileModule(translationsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { menuJa } = await import("data:text/javascript," + encodeURIComponent(outputText));

test("legacy and seed-backed item names have Japanese equivalents", () => {
  assert.equal(menuJa["Ardbeg 10 Year"], "アードベッグ 10年");
  assert.equal(menuJa["Maker’s Mark"], "メーカーズマーク");
  assert.equal(menuJa["Wine & Champagne"], "ワイン・シャンパン");
  assert.equal(menuJa["Caffey Grain"], "カフェグレーン");
});
test("drink ingredients and search tags support English and Japanese", () => {
  for (const name of ["jasmine", "oolong", "shochu", "smoky", "sour", "Hokkaido", "peach liqueur"]) {
    assert.ok(menuJa[name] && /[ぁ-んァ-ヶ一-龥]/.test(menuJa[name]), name);
  }
  const indexSource = read("i18n/index.ts");
  assert.match(indexSource, /normalizeMenuText\(text\)/);
  assert.match(indexSource, /normalizedMenuJa\.get\(normalizeMenuText\(text\)\)/);
  assert.match(indexSource, /\$\{text\} \$\{japanese\}/);
});
test("menu item editor remains available with mobile-sized accessible target", () => {
  const row = read("components/MenuItemRow.tsx");
  const dropdown = read("components/DropdownMenu.tsx");
  assert.match(row, /Open item editor for/);
  assert.match(row, /min-width: 44px/);
  assert.match(row, /min-height: 44px/);
  assert.match(dropdown, /triggerRect\.top - popupRect\.height/);
  assert.match(dropdown, /top: \$\{\(\{ \$top \}\) =>/);
  assert.match(dropdown, /right: \$\{\(\{ \$right \}\) =>/);
});
test("full menu edit saving stays unavailable without matching backend item update API", () => {
  const edit = read("components/MenuItemForm.tsx");
  assert.match(edit, /if \(editingItem\) return;/);
  assert.match(edit, /Save — unavailable/);
});
