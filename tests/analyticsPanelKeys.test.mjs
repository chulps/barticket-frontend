import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("Analytics.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const keys = new Map();
function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && ["ItemSalesPanel", "AnalyticsTicketHistory"].includes(node.tagName.getText(ast))) {
        const key = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === "key");
        assert.ok(key?.initializer && ts.isJsxExpression(key.initializer));
        keys.set(node.tagName.getText(ast), key.initializer.expression.getText(ast));
    }
    ts.forEachChild(node, visit);
}
visit(ast);

test("item sales and ticket history sibling keys remain distinct through monthly refresh and range changes", () => {
    assert.equal(keys.size, 2);
    const expressions = [...keys.values()];
    for (const period of ["month:2026-11", "month:2026-11", "day:2026-11-17", "month:2026-11", "month:2026-10", "all:"]) {
        const values = expressions.map(expression => new Function("contextKeyForItems", `return (${expression})`)(period));
        assert.equal(new Set(values).size, 2, `duplicate sibling keys for ${period}`);
        assert.ok(values.every(value => value.includes(period)), "period navigation must still reset panel state");
    }
});
