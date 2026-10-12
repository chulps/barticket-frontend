import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const helpers = readFileSync(new URL("../src/pages/analyticsNavigation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(helpers, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { shiftYear, shiftMonth, shiftDay } = await import("data:text/javascript," + encodeURIComponent(outputText));

test("Year arrows move exactly one calendar year in either direction", () => {
    assert.equal(shiftYear("2026", -1), "2025");
    assert.equal(shiftYear("2026", 1), "2027");
    assert.equal(shiftYear("2000", -1), "1999");
});

test("Month arrows move exactly one month, including December / January boundaries", () => {
    assert.equal(shiftMonth("2026-09", -1), "2026-08");
    assert.equal(shiftMonth("2026-09", 1), "2026-10");
    assert.equal(shiftMonth("2026-12", 1), "2027-01");
    assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("Daily arrows move one calendar day, not a month", () => {
    assert.equal(shiftDay("2026-09-15", -1), "2026-09-14");
    assert.equal(shiftDay("2026-09-15", 1), "2026-09-16");
    assert.equal(shiftDay("2026-09-30", 1), "2026-10-01");
    assert.equal(shiftDay("2026-10-01", -1), "2026-09-30");
    assert.equal(shiftDay("2026-12-31", 1), "2027-01-01");
    assert.equal(shiftDay("2027-01-01", -1), "2026-12-31");
});

test("Daily arrows work across leap days and normal February month boundaries", () => {
    assert.equal(shiftDay("2028-02-28", 1), "2028-02-29");
    assert.equal(shiftDay("2028-02-29", 1), "2028-03-01");
    assert.equal(shiftDay("2028-03-01", -1), "2028-02-29");
    assert.equal(shiftDay("2027-02-28", 1), "2027-03-01");
    assert.equal(shiftDay("2027-03-01", -1), "2027-02-28");
});

test("Day navigation does not skip missing shift dates", () => {
    const recordedNights = new Set(["2026-09-15", "2026-09-17"]);
    const next = shiftDay("2026-09-15", 1);
    assert.equal(next, "2026-09-16");
    assert.equal(recordedNights.has(next), false);
    assert.equal(shiftDay(next, 1), "2026-09-17");
});

test("Analytics buttons use the appropriate unit, update selected date, and keep All Time unchanged", () => {
    const source = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    const yearNav = source.split('{range === "year" ? (')[1]?.split('{range === "month" ? (')[0];
    const monthNav = source.split('{range === "month" ? (')[1]?.split('{range === "day" ? (')[0];
    const dayNav = source.split('{range === "day" ? (')[1]?.split('                        </DayNavigator>')[0];
    assert.ok(yearNav && monthNav && dayNav, "all three period navigators are present");
    assert.match(yearNav, /shiftYear\(year, -1\)/);
    assert.match(yearNav, /shiftYear\(year, 1\)/);
    assert.match(monthNav, /shiftMonth\(month, -1\)/);
    assert.match(monthNav, /shiftMonth\(month, 1\)/);
    assert.match(dayNav, /pickDate\(shiftDay\(pickedDate, -1\)\)/);
    assert.match(dayNav, /pickDate\(shiftDay\(pickedDate, 1\)\)/);
    assert.doesNotMatch(dayNav, /shiftMonth/);
    assert.match(source, /setPickedDate\(iso\);\s*setMonth\(monthKey\(iso\)\);\s*setYear\(yearKey\(iso\)\);/);
    assert.match(source, /setDayId\(match\?\.id \?\? null\)/);
    assert.doesNotMatch(source, /\{range === "all" \? \(\s*<Navigator/);
});
