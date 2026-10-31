import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const profile = readFileSync(new URL("../src/pages/Profile.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/pages/StaffWorkHistory.tsx", import.meta.url), "utf8");
const income = readFileSync(new URL("../src/pages/StaffIncome.tsx", import.meta.url), "utf8");
const chart = readFileSync(new URL("../src/components/PayBreakdownChart.tsx", import.meta.url), "utf8");
const sharedCharts = readFileSync(new URL("../src/components/AnalyticsCharts.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8");

test("Profile income is personal for staff and managers and shows wages and drink bonuses", () => {
    assert.match(history, /const availableSections: Panel\[\] = \["hours", "drinks"\]/);
    assert.doesNotMatch(history, /benefits|Bonuses, adjustments & deductions|Not available yet/);
    assert.match(profile, /<StaffIncome[^>]*role=\{account\.role\}/);
    assert.match(income, /accountApi\.personalEarnings\(month\)/);
    assert.match(income, /canViewChuckPersonalPay/);
    assert.match(income, /accountApi\.chuckMonthlyPay\(month\)/);
    assert.match(income, /Gross salary/);
    assert.match(income, /Staff pay owed/);
    assert.match(income, /Other deductions/);
    assert.match(income, /Amount owed to Chuck/);
    assert.match(income, /staff_owed\.map/);
    assert.match(income, /chuckReport\.deductions\.map/);
    assert.match(income, /response\.user_id !== userId/);
    assert.match(income, /hourly_wages/);
    assert.match(income, /staff_drink_bonus/);
    assert.match(income, /Monthly income breakdown/);
    assert.match(income, /Gross salary breakdown/);
    assert.match(income, /DonutChart/);
    assert.match(income, /Estimated income by day/);
    assert.match(income, /Staff pay owed by person/);
    assert.match(income, /Chuck-managed shift stats/);
    assert.match(income, /Recorded sales by night/);
    assert.match(income, /original service date/);
    assert.match(account, /serviceSales: \(dateFrom: string, dateTo: string\)/);
    assert.match(account, /\/analytics\/service-sales/);
    assert.match(sharedCharts, /aria-label=\{title\}/);
    assert.match(income, /<NoriMonthlySummary userId=\{props.userId\} locale=\{props.locale\}/);
    assert.match(income, /chuckReport\.complete/);
    assert.match(income, /amount_yen_unrounded == null/);
    assert.match(chart, /role="meter"/);
    assert.match(chart, /aria-valuetext/);
    assert.match(income, /aria-label=\{ja \? "前月" : "Previous month"\}/);
    assert.match(income, /shiftMonth\(value, -1\)/);
    assert.match(income, /<Filters>/);
    assert.match(income, /Sort by/);
    assert.match(account, /personalEarnings: \(month: string\) =>/);
    assert.match(account, /\/profile\/earnings\?month=/);
    assert.doesNotMatch(income, /accountApi\.listUsers\(|accountApi\.closedShifts\(|staffEarnings/);
    for (const [name, source] of [["Profile", profile], ["StaffWorkHistory", history], ["StaffIncome", income], ["PayBreakdownChart", chart], ["AnalyticsCharts", sharedCharts]]) {
        assert.equal(ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0);
    }
});

test("staff income never presents an estimate as a paid amount or treats unknown wage inputs as zero", () => {
    assert.match(income, /estimate/i);
    assert.match(income, /report\.note/);
    assert.match(income, /amount_yen_unrounded/);
    assert.match(income, /Hourly rate unavailable/);
    assert.match(income, /Could not load income breakdown/);
    assert.match(income, /これはChuck担当シフトに基づく月次の支払見積もりです/);
    assert.match(income, /: chuckReport\.note/);
    assert.match(income, /bonus\?\.complete \? bonus\.amount_yen : null/);
});
