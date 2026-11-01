import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServerStyleSheet } from "styled-components";
import ts from "typescript";
const source = readFileSync("src/components/AnalyticsCharts.tsx", "utf8");
const output = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
} }).outputText;
const require = createRequire(import.meta.url);
const exports = {};
new Function("require", "exports", output)(name => name === "./Icon" ? { default: () => null } : require(name), exports);
test("shared horizontal rows retain every value/label and signed zero geometry", () => {
    const sheet = new ServerStyleSheet();
    try {
        const html = renderToStaticMarkup(sheet.collectStyles(createElement(exports.HorizontalBarRows, {
            label: "Weekday averages and shift counts",
            bars: [
                { id:"missing",label:"Mon",value:0,display:"No data · 0 shifts" },
                { id:"zero",label:"Tue",value:0,display:"¥0 · 2 shifts" },
                { id:"negative",label:"水曜日の長いラベル",value:-50,display:"-¥50 · 2 shifts" },
                { id:"positive",label:"Thu ★",value:100,display:"¥100 · 5 shifts" },
            ],
        })));
        const css = sheet.getStyleTags();
        assert.equal((html.match(/<li/g) ?? []).length, 4);
        assert.match(html, /No data · 0 shifts/);
        assert.match(html, /¥0 · 2 shifts/);
        assert.match(html, /水曜日の長いラベル/);
        assert.match(html, /left:0%;width:33.33333333333333%/);
        assert.match(html, /width:66.66666666666666%/);
        assert.match(css, /grid-template-columns:minmax\(48px, 4rem\) minmax\(24px, 1fr\) minmax\(0, 12rem\)/);
        assert.match(css, /align-items:center/);
        assert.match(css, /overflow-wrap:anywhere/);
        assert.doesNotMatch(html, /tabindex=/); // Noninteractive chart must not add keyboard stops.
    } finally { sheet.seal(); }
});
test("profile changes only the weekday presentation, not fetching, dates, or pay donuts", () => {
    const profile = readFileSync("src/pages/ManagedShiftStats.tsx", "utf8");
    assert.match(profile, /<HorizontalBarRows/);
    assert.match(profile, /value: row.average_sales_yen \?\? 0/);
    assert.match(profile, /row.average_sales_yen === null/);
    assert.match(profile, /row.shift_count/);
    assert.match(profile, /<HorizontalBarChart title=\{ja \? "営業日別の売上"/);
    assert.doesNotMatch(profile, /const Bars|const Track|signedBar/);
});
