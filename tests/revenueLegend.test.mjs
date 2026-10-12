import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const chart = readFileSync(new URL("../src/components/AnalyticsCharts.tsx", import.meta.url), "utf8");
const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");

// Parse the actual TSX so syntax errors or accidentally missing JSX elements
// are caught in addition to the regular TypeScript build.
const syntax = ts.createSourceFile("AnalyticsCharts.tsx", chart, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

test("revenue legend renders swatch, real label, and a formatted total in each lockup", () => {
    assert.equal(syntax.parseDiagnostics.length, 0);
    assert.match(chart, /legend\?:\s*\{\s*label:\s*string;\s*color:\s*string;\s*value:\s*number\s*\}\[\]/);
    assert.match(chart, /<InlineLegend>[\s\S]*?legend\.map\(\(item\) => \([\s\S]*?<RevenueLegendItem key=\{item\.label\}>/);
    assert.match(chart, /<RevenueSwatch \$color=\{item\.color\} aria-hidden="true" \/>/);
    assert.match(chart, /<RevenueLegendLabel>\{item\.label\}<\/RevenueLegendLabel>/);
    assert.match(chart, /<RevenueLegendValue>\{formatFull\(item\.value\)\}<\/RevenueLegendValue>/);
    assert.match(chart, /const RevenueLegendLabel = styled\.label`/);
    assert.match(chart, /const RevenueLegendValue = styled\.strong`[\s\S]*?font-family: var\(--font-family-data\);/);
    assert.match(chart, /const RevenueLegendValue = styled\.strong`[\s\S]*?font-variant-numeric: tabular-nums;/);
});

test("revenue legend grid has one column on mobile, two on tablet, four on desktop", () => {
    const start = chart.indexOf("const InlineLegend = styled.ul`");
    const end = chart.indexOf("`;", start);
    assert.ok(start >= 0 && end > start, "the revenue legend has a dedicated grid");
    const rules = chart.slice(start, end);
    assert.match(rules, /display: grid;/);
    assert.match(rules, /grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(rules, /@media \(min-width: 640px\) \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\}/);
    assert.match(rules, /@media \(min-width: 1024px\) \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);\s*\}/);
});

test("legend values use actual cash/card/other/unknown totals for the selected chart period", () => {
    const start = analytics.indexOf("function RangeCharts(");
    const end = analytics.indexOf("function MissingTicketsPanel(", start);
    assert.ok(start >= 0 && end > start);
    const rangeChart = analytics.slice(start, end);
    const legend = rangeChart.match(/legend=\{\[([\s\S]*?)\]\}/)?.[1] ?? "";
    const fields = ["cash", "card", "other", "unknownPayment"];
    for (const field of fields) {
        assert.match(legend, new RegExp(`value: totals\\.${field}(?:\\s|,|\\s*\\})`));
    }
    assert.match(legend, /color: UNKNOWN, value: totals\.unknownPayment/);
    assert.match(rangeChart, /const points = range === "all" \? yearPoints\(shifts\) : range === "year" \? monthPoints\(shifts, locale\) : nightPoints\(shifts, locale\)/);
    assert.match(rangeChart, /bars=\{paymentBars\(points\)\}/);
});

test("guest bar chart and payment donut retain their existing separate presentations", () => {
    assert.match(analytics, /bars=\{guestBars\(points\)\}/);
    assert.match(chart, /const Legend = styled\.ul`/);
    assert.match(chart, /const LegendItem = styled\.li`/);
    assert.match(chart, /<Legend>[\s\S]*?slices\.map\(\(slice\) => \(/);
});
