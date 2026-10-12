import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/quickEntry.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { addSelection, changeSelectionQuantity } =
    await import("data:text/javascript," + encodeURIComponent(outputText));

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
});

test("15ml and 30ml remain separate from standard", () => {
    const item = drink(1);
    const selections = ["standard", "15ml", "30ml"].reduce((state, key) => addSelection(state, item, key), []);
    assert.deepEqual(selections.map((row) => row.priceKey), ["standard", "15ml", "30ml"]);
});

test("decrement removes at zero; increment caps at 99", () => {
    const first = addSelection([], drink(1), "standard");
    assert.deepEqual(changeSelectionQuantity(first, 1, "standard", -1), []);
    const max = changeSelectionQuantity(first, 1, "standard", 1000);
    assert.equal(max[0].quantity, 99);
    assert.equal(addSelection(max, drink(1), "standard")[0].quantity, 99);
});

test("out-of-stock, ingredient-only, and unavailable prices cannot be selected", () => {
    assert.deepEqual(addSelection([], drink(1, { inStock: false }), "standard"), []);
    assert.deepEqual(addSelection([], drink(1, { category: "Cocktail Ingredients" }), "standard"), []);
    assert.deepEqual(addSelection([], drink(1, { prices: { "15ml": 500 } }), "standard"), []);
});
