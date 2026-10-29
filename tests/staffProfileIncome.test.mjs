import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const profile = readFileSync(new URL("../src/pages/Profile.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/pages/StaffWorkHistory.tsx", import.meta.url), "utf8");
const income = readFileSync(new URL("../src/pages/StaffIncome.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8");

test("Profile income is personal for staff and managers and shows wages and drink bonuses", () => {
    assert.match(profile, /role=\{account\.role\}/);
    assert.match(history, /role === "staff".*\["hours", "drinks", "income"\]/s);
    assert.match(history, /role === "staff"[\s\S]*: \["hours", "drinks", "benefits", "income"\]/);
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
    assert.match(income, /type="month"/);
    assert.match(income, /Sort by/);
    assert.match(account, /personalEarnings: \(month: string\) =>/);
    assert.match(account, /\/profile\/earnings\?month=/);
    assert.doesNotMatch(income, /accountApi\.listUsers\(|accountApi\.closedShifts\(|staffEarnings/);
    for (const [name, source] of [["Profile", profile], ["StaffWorkHistory", history], ["StaffIncome", income]]) {
        assert.equal(ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0);
    }
});

test("staff income never presents an estimate as a paid amount or treats unknown wage inputs as zero", () => {
    assert.match(income, /estimate/i);
    assert.match(income, /report\.note/);
    assert.match(income, /amount_yen_unrounded/);
    assert.match(income, /Hourly rate unavailable/);
    assert.match(income, /Could not load income breakdown/);
});
