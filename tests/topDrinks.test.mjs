import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/components/topDrinks.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { topSellingDrinks, POPULAR_WINDOW_DAYS } =
    await import("data:text/javascript," + encodeURIComponent(outputText));

const nowMs = Date.UTC(2026, 9, 12);
const nowSec = nowMs / 1000;
const drink = (id, extra = {}) => ({
    id, name: "Drink " + id, category: "Whisky", prices: { standard: 900 }, ...extra,
});
const line = (id, quantity, extra = {}) => ({
    type: "menu", menu_item_id: id, quantity, ...extra,
});
const ticket = (items, extra = {}) => ({
    status: "paid", payment: { paid_at: nowSec - 100 }, items, ...extra,
});
const ids = (result) => result.map((item) => item.id);

test("top three are ranked by units sold, not revenue or line count", () => {
    const menu = [drink(1), drink(2), drink(3), drink(4)];
    const tickets = [
        ticket([line(1, 5), line(2, 2)]),
        ticket([line(2, 4), line(3, 4), line(4, 1)]),
    ];
    assert.deepEqual(ids(topSellingDrinks(tickets, menu, nowMs)), [2, 1, 3]);
});

test("only paid tickets in the last 30 days count", () => {
    const menu = [drink(1), drink(2)];
    const tickets = [
        ticket([line(1, 20)], { status: "cancelled" }),
        ticket([line(1, 20)], { status: "open" }),
        ticket([line(1, 20)], { payment: null }),
        ticket([line(1, 20)], { payment: { paid_at: nowSec - (POPULAR_WINDOW_DAYS + 1) * 86400 } }),
        ticket([line(1, 20)], { payment: { paid_at: nowSec + 100 } }),
        ticket([line(2, 1)]),
    ];
    assert.deepEqual(ids(topSellingDrinks(tickets, menu, nowMs)), [2]);
});

test("exclude cover charges, staff drinks, missing menu items, and unavailable stock", () => {
    const menu = [drink(1), drink(2, { inStock: false }), drink(3, { category: "Cocktail Ingredients" }), drink(4)];
    const tickets = [
        ticket([line(1, 1), line(2, 20), line(3, 20), line(4, 2, { staff_drink: true }),
            line(4, 20, { type: "cover" }), line(999, 20), line(4, 2)]),
    ];
    assert.deepEqual(ids(topSellingDrinks(tickets, menu, nowMs)), [4, 1]);
});

test("combine price variants, ignore invalid quantities, break ties consistently", () => {
    const menu = [drink(1), drink(2), drink(3)];
    const tickets = [ticket([
        line(1, 2, { price_key: "15ml" }),
        line(1, 1, { price_key: "30ml" }),
        line(2, 3),
        line(3, -100),
        line(3, 0),
    ])];
    assert.deepEqual(ids(topSellingDrinks(tickets, menu, nowMs)), [1, 2]);
});

test("show fewer than three when there is insufficient data", () => {
    assert.deepEqual(topSellingDrinks([], [drink(1)], nowMs), []);
    assert.deepEqual(ids(topSellingDrinks([ticket([line(1, 1)])], [drink(1)], nowMs)), [1]);
});
