import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/quickEntry.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const {
    addSelection, changeSelectionQuantity, readStoredIds,
    recordRecent, toggleFavorite, quickEntryGroups, MAX_RECENT,
} = await import("data:text/javascript," + encodeURIComponent(outputText));

const drink = (id, extra = {}) => ({
    id, name: "Drink " + id, category: "Whisky",
    prices: { standard: 900, "15ml": 500, "30ml": 1000 }, ...extra,
});

test("repeated taps increase quantity without duplicating line selections", () => {
    const first = addSelection([], drink(1), "standard");
    const twice = addSelection(first, drink(1), "standard");
    assert.equal(twice.length, 1);
    assert.equal(twice[0].quantity, 2);
    assert.equal(twice[0].priceKey, "standard");
    assert.equal(twice[0].item.id, 1);
});

test("15ml and 30ml stay distinct from standard pricing", () => {
    const item = drink(1);
    const selections = ["standard", "15ml", "30ml"].reduce((state, key) => addSelection(state, item, key), []);
    assert.equal(selections.length, 3);
    assert.deepEqual(selections.map((row) => row.priceKey), ["standard", "15ml", "30ml"]);
});

test("decrement removes at zero; increment is capped at 99", () => {
    const first = addSelection([], drink(1), "standard");
    assert.deepEqual(changeSelectionQuantity(first, 1, "standard", -1), []);
    const max = changeSelectionQuantity(first, 1, "standard", 1000);
    assert.equal(max[0].quantity, 99);
    assert.equal(addSelection(max, drink(1), "standard")[0].quantity, 99);
});

test("out-of-stock, ingredient-only, and missing prices cannot be selected", () => {
    assert.deepEqual(addSelection([], drink(1, { inStock: false }), "standard"), []);
    assert.deepEqual(addSelection([], drink(1, { category: "Cocktail Ingredients" }), "standard"), []);
    assert.deepEqual(addSelection([], drink(1, { prices: { "15ml": 500 } }), "standard"), []);
});

test("favorite toggles are stable and do not duplicate IDs", () => {
    assert.deepEqual(toggleFavorite([], 42), [42]);
    assert.deepEqual(toggleFavorite([42], 42), []);
});

test("recent selections are unique, newest first, and bounded", () => {
    const previous = Array.from({ length: MAX_RECENT }, (_, i) => i + 1);
    const updated = recordRecent(previous, [2, 20, 2, 21]);
    assert.deepEqual(updated.slice(0, 3), [21, 2, 20]);
    assert.equal(updated.length, MAX_RECENT);
});

test("corrupt storage is safely ignored", () => {
    assert.deepEqual(readStoredIds("not-json"), []);
    assert.deepEqual(readStoredIds('{"id": 3}'), []);
    assert.deepEqual(readStoredIds('[1,1,-1,2,"3",null]'), [1, 2]);
});

test("favorites and recent groups exclude ingredient-only items and repeat IDs", () => {
    const groups = quickEntryGroups(
        [drink(1), drink(2), drink(3, { category: "Cocktail Ingredients" }), drink(4)],
        [1, 3], [2, 1, 4],
    );
    assert.deepEqual(groups.favorites.map((row) => row.id), [1]);
    assert.deepEqual(groups.recent.map((row) => row.id), [2, 4]);
    assert.deepEqual(groups.all.map((row) => row.id), [1, 2, 4]);
});
