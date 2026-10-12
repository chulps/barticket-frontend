import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const navigation = readFileSync(new URL("../src/pages/analyticsNavigation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(navigation, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { analyticsDrillDownTarget } = await import("data:text/javascript," + encodeURIComponent(outputText));

const shifts = [
    { id: 12, business_date: "2025-12-31" },
    { id: 41, business_date: "2026-09-15" },
    { id: 99, business_date: "2026-09-15" },
    { id: 42, business_date: "2026-09-16" },
];

test("All Time year bar drills into the chosen year's report", () => {
    assert.deepEqual(analyticsDrillDownTarget("all", "2025", shifts), { range: "year", key: "2025" });
    assert.deepEqual(analyticsDrillDownTarget("all", "2026", shifts), { range: "year", key: "2026" });
    assert.equal(analyticsDrillDownTarget("all", "2026-09", shifts), null);
});

test("Year month bar drills into the chosen month's report", () => {
    assert.deepEqual(analyticsDrillDownTarget("year", "2026-09", shifts), { range: "month", key: "2026-09" });
    assert.deepEqual(analyticsDrillDownTarget("year", "2025-12", shifts), { range: "month", key: "2025-12" });
    assert.equal(analyticsDrillDownTarget("year", "2026-13", shifts), null);
    assert.equal(analyticsDrillDownTarget("year", "2026-00", shifts), null);
});

test("Monthly date bar resolves the exact shift's business date rather than its displayed label", () => {
    assert.deepEqual(analyticsDrillDownTarget("month", "41", shifts), {
        range: "day", key: "2026-09-15", shiftId: 41,
    });
    assert.deepEqual(analyticsDrillDownTarget("month", "42", shifts), {
        range: "day", key: "2026-09-16", shiftId: 42,
    });
    assert.deepEqual(analyticsDrillDownTarget("month", "99", shifts), {
        range: "day", key: "2026-09-15", shiftId: 99,
    });
    assert.equal(analyticsDrillDownTarget("month", "10000", shifts), null);
    assert.equal(analyticsDrillDownTarget("month", "Sep 15", shifts), null);
});

test("both revenue and guest charts present View report only after bar selection", () => {
    const charts = readFileSync(new URL("../src/components/AnalyticsCharts.tsx", import.meta.url), "utf8");
    const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    for (const [name, source] of [["AnalyticsCharts.tsx", charts], ["Analytics.tsx", analytics]]) {
        const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.equal(file.parseDiagnostics.length, 0, `${name} parses`);
    }
    const rangeStart = analytics.indexOf("function RangeCharts(");
    const rangeEnd = analytics.indexOf("function ", rangeStart + 12);
    const rangeCharts = analytics.slice(rangeStart, rangeEnd);
    for (const type of ["paymentBars", "guestBars"]) {
        assert.match(rangeCharts, new RegExp(`bars=\\{${type}\\(points\\)\\}[\\s\\S]*?onDrillDown=\\{onDrillDown\\}`));
    }
    assert.match(charts, /\{active \? \([\s\S]*?\{onDrillDown && drillDownLabel \? \(/);
    assert.match(charts, /onDrillDown\(active\.id\)/);
    assert.match(charts, /setSelected\(null\)/);
    assert.match(charts, /<button type="button" onClick=\{\(\) => void copy\(activeLabel\)\}/);
    assert.match(charts, /onKeyDown=\{\(event\) => \{ if \(event\.key === "Enter" \|\| event\.key === " "\)/);
});

test("drill-down dispatches to the corresponding tab, preserving month/year/day navigation", () => {
    const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    const start = analytics.indexOf("function drillIntoBar(");
    const stop = analytics.indexOf("\n    return (", start);
    const handler = analytics.slice(start, stop);
    assert.ok(start > 0 && stop > start);
    assert.match(handler, /analyticsDrillDownTarget\(range, barId, shifts \?\? \[\]\)/);
    assert.match(handler, /setYear\(target\.key\)/);
    assert.match(handler, /showMonth\(target\.key\)/);
    assert.match(handler, /pickDate\(target\.key\)/);
    assert.match(handler, /setDayId\(target\.shiftId\)/);
    assert.match(handler, /setRange\(target\.range\)/);
    assert.match(analytics, /onDrillDown=\{drillIntoBar\}/);
    assert.match(analytics, /"View year report"/);
    assert.match(analytics, /"View monthly report"/);
    assert.match(analytics, /"View daily report"/);
    assert.match(analytics, /"年別レポートを見る"/);
    assert.match(analytics, /"月別レポートを見る"/);
    assert.match(analytics, /"日別レポートを見る"/);
});
