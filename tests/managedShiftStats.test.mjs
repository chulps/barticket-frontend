import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/pages/managedShiftStatsDisplay.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { businessDateLabel, weekdayLabel, bestWeekdays, signedBar } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
test("business dates retain weekday in browser timezones, including year boundaries", () => {
    const original = process.env.TZ;
    try {
        for (const tz of ["Pacific/Kiritimati", "America/Los_Angeles", "Asia/Tokyo"]) {
            process.env.TZ = tz;
            assert.match(businessDateLabel("2026-10-01", "en"), /Thu/);
            assert.match(businessDateLabel("2026-11-01", "en"), /Sun/);
            assert.match(businessDateLabel("2027-01-01", "en"), /Fri/);
            assert.match(businessDateLabel("2026-10-01", "ja"), /木/);
        }
    } finally { process.env.TZ = original; }
});
test("all seven labels are localized in Monday-first order", () => {
    assert.deepEqual(Array.from({ length: 7 }, (_, day) => weekdayLabel(day, "en")), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    assert.deepEqual(Array.from({ length: 7 }, (_, day) => weekdayLabel(day, "ja")), ["月", "火", "水", "木", "金", "土", "日"]);
});
test("highest weekday excludes missing data, retains zeros and all ties in calendar order", () => {
    const row = (weekday, shift_count, average_sales_yen) => ({ weekday, shift_count, average_sales_yen });
    assert.deepEqual(bestWeekdays([row(0, 0, null)]), []);
    assert.deepEqual(bestWeekdays([row(6, 1, 0), row(0, 0, null), row(1, 3, 0), row(3, 2, -10)]), [1, 6]);
    assert.deepEqual(bestWeekdays([row(0, 2, -100), row(1, 1, -50)]), [1]);
});
test("negative sales bars extend left of zero without negative widths", () => {
    assert.deepEqual(signedBar(-50, -100, 100), { left: 25, width: 25, zero: 50 });
    assert.deepEqual(signedBar(100, -100, 100), { left: 50, width: 50, zero: 50 });
    assert.deepEqual(signedBar(0, 0, 0), { left: 0, width: 0, zero: -0 });
});
test("profile stats use authorized aggregates on demand with bounded session-local caching", () => {
    const component = readFileSync(new URL("../src/pages/ManagedShiftStats.tsx", import.meta.url), "utf8");
    const income = readFileSync(new URL("../src/pages/StaffIncome.tsx", import.meta.url), "utf8");
    assert.match(component, /if \(!active\) return/);
    assert.match(component, /report.user_id !== userId/);
    assert.match(component, /getToken\(\) !== token/);
    assert.match(component, /cache.current.clear\(\)/);
    assert.match(component, /if \(period !== "month"\) void load\(period\)/);
    assert.doesNotMatch(component, /subscribeRealtime|setInterval|analyticsShifts|serviceSales/);
    assert.doesNotMatch(income, /accountApi.analyticsShifts|accountApi.serviceSales/);
    assert.match(component, /No data/);
    assert.match(component, /Tied highest average/);
    assert.match(component, /HorizontalBarRows/);
    assert.match(readFileSync(new URL("../src/components/AnalyticsCharts.tsx", import.meta.url), "utf8"), /aria-hidden="true"/);
    assert.match(component, /Weekday averages and shift counts/);
});

test("Chuck pay information is always open while historical stats remain opt-in", () => {
    const income = readFileSync(new URL("../src/pages/StaffIncome.tsx", import.meta.url), "utf8");
    const profile = readFileSync(new URL("../src/pages/Profile.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(income, /showStats|setShowStats/);
    assert.match(income, /<ManagedShiftStats[^>]+active=\{true\}/);
    assert.match(income, /<OpenSection><h3>\{ja \? "給与の内訳・明細"/);
    assert.match(profile, /view === "pay" \? <StaffIncome/);
});
