import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../src/components/MenuItemForm.tsx", import.meta.url), "utf8");
const picker = readFileSync(new URL("../src/components/AddItemPicker.tsx", import.meta.url), "utf8");
const staffPicker = readFileSync(new URL("../src/components/AddStaffDrink.tsx", import.meta.url), "utf8");

test("saleable drinks accept standard OR 15ml, not 30ml alone", () => {
    assert.match(form, /!cocktailIngredient && nextPrices\.standard === undefined && nextPrices\["15ml"\] === undefined/);
    assert.doesNotMatch(form, /!cocktailIngredient && nextPrices\.standard === undefined\)/);
});

test("prices are sent only for entered sizes; no fabricated standard price", () => {
    assert.match(form, /if \(raw === ""\) continue;/);
    assert.match(form, /nextPrices\[key\] = amount/);
    assert.match(form, /prices: nextPrices/);
});

test("cocktail ingredients can still be created without a price", () => {
    assert.match(form, /!cocktailIngredient && nextPrices\.standard/);
});

test("existing add-to-ticket flows support 15ml-only items", () => {
    assert.match(picker, /\["standard", "15ml", "30ml"\]/);
    assert.match(picker, /item\.prices\?\.\[key\] !== undefined/);
    assert.match(staffPicker, /Object\.entries\(prices \?\? \{\}\)/);
    assert.match(staffPicker, /prices\.some\(\(\[key\]\) => key === priceKey\)/);
});

test("price helper text explains standard-or-15ml choice in both languages", () => {
    assert.match(form, /Enter a standard or 15ml price in yen/);
    assert.match(form, /通常価格または15mlの価格/);
    assert.match(form, /15ml price can replace the standard price/);
});
