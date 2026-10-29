import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const team = readFileSync(new URL("../src/pages/AdminTeam.tsx", import.meta.url), "utf8");
const overview = readFileSync(new URL("../src/pages/AdminMonthlyPayOverview.tsx", import.meta.url), "utf8");
const chart = readFileSync(new URL("../src/components/PayBreakdownChart.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8");

test("Admin monthly pay comparison is limited to designated managers and uses manager APIs", () => {
    assert.match(team, /<AdminMonthlyPayOverview viewer=\{viewer\} people=\{people\}/);
    assert.match(overview, /viewer\.role !== "manager"/);
    assert.match(overview, /viewers\.chuckUserId !== null/);
    assert.match(overview, /viewer\.id === viewers\.chuckUserId \|\| viewer\.id === viewers\.noriUserId/);
    assert.match(overview, /accountApi\.adminPersonalEarnings\(person\.id, month\)/);
    assert.match(overview, /accountApi\.adminChuckMonthlyPay\(month\)/);
    assert.match(overview, /manager_pay_policy_unconfirmed/);
    assert.match(account, /\/admin\/staff-compensation\/users\//);
    assert.match(account, /\/admin\/staff-compensation\/chuck-monthly-pay/);
    assert.match(overview, /Total staff pay/);
    assert.match(overview, /Amount owed/);
    assert.match(overview, /Details: staff owed on Chuck-managed shifts and deductions/);
    assert.match(overview, /Monthly staff pay by person/);
    assert.match(overview, /staffRows\s*\.filter\(row => row\.complete/);
    assert.match(overview, /omitted from the chart because hours or rates are incomplete/);
    assert.match(overview, /Chuck’s monthly pay allocation/);
    assert.match(chart, /role="meter"/);
    assert.doesNotMatch(overview, /accountApi\.listUsers\(/);
    assert.equal(ts.createSourceFile("AdminMonthlyPayOverview.tsx", overview, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0);
});

test("Admin pay comparison keeps incomplete staff inputs unavailable", () => {
    assert.match(overview, /wages\?\.complete && wageValue !== null/);
    assert.match(overview, /drinks\?\.complete \? drinks\.amount_yen : null/);
    assert.match(overview, /drinks\?\.complete && bonusValue !== null/);
    assert.match(overview, /complete \? wageValue! \+ bonusValue! : null/);
    assert.match(overview, /not payment records/);
    assert.match(overview, /salary preview|estimate/i);
});
