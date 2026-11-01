import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/components/MenuItemForm.tsx", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/ModalHost.tsx", import.meta.url), "utf8");

test("mobile price fields accept numeric keyboard input and visible focus", () => {
  assert.match(form, /PriceInput id=\{id \+ "-standard"\} type="text" inputMode="numeric"/);
  assert.match(form, /font-size: 16px/);
  assert.match(form, /pointer-events: auto/);
  assert.match(form, /&:focus-within \{ outline: 2px solid var\(--royal-400\)/);
});

test("category selectors use explicit chevrons and custom choices", () => {
  assert.match(form, /<SelectInput id=\{id \+ "-category"\}/);
  assert.match(form, /<SelectInput id=\{id \+ "-subcategory"\}/);
  assert.doesNotMatch(form, /<Caret/);
  assert.match(readFileSync(new URL("../src/index.css", import.meta.url), "utf8"), /background-image: var\(--dropdown-caret-image\)/);
  assert.match(form, /<option value="__new__">/);
  assert.doesNotMatch(form, /<datalist/);
});

test("volume only appears for beer and isn't sent for other categories", () => {
  assert.match(form, /\{isBeer \? <Field>/);
  assert.match(form, /volume: isBeer \? volume\.trim\(\) \|\| undefined : undefined/);
});

test("each field has explanatory help in English and Japanese", () => {
  for (const field of ["name", "category", "subcategory", "brand", "volume", "description", "notes", "tags", "standard"]) {
    assert.match(form, new RegExp('id=\\{id \\+ "-' + field + '"\\}'));
  }
  assert.match(form, /const help = \(en: string, jp: string\)/);
  assert.match(form, /Optional search keywords/);
  assert.match(form, /通常の1杯分の価格/);
});

test("standard price required except cocktail ingredients, and tags are preserved", () => {
  assert.match(form, /!cocktailIngredient && nextPrices\.standard === undefined/);
  assert.match(form, /const draft = tagDraft\.trim\(\)/);
  assert.match(form, /tags: nextTags/);
});

test("modal only closes from direct backdrop clicks", () => {
  assert.match(modal, /event\.target === event\.currentTarget/);
  assert.match(modal, /aria-modal="true"/);
});
