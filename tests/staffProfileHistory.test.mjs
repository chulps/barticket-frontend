import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const helper = readFileSync(new URL("../src/pages/staffProfileData.ts", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/pages/Profile.tsx", import.meta.url), "utf8");
const history = readFileSync(new URL("../src/pages/StaffWorkHistory.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(helper, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/import type.*?;\s*/g, "");
const { buildStaffActivity, recordedStaffTotals } = await import("data:text/javascript," + encodeURIComponent(transpiled));

function shift(id, businessDate, status, extras = {}) {
    return {
        id, business_date: businessDate, status, staff_hours: [], staff_drinks: [],
        punches: [], ...extras,
    };
}

test("Profile mounts personal history only after authentication, without calling manager APIs", () => {
    assert.match(profile, /<StaffWorkHistory key={account.id} userId={account.id} locale={locale}/);
    assert.doesNotMatch(profile, /accountApi\.listUsers\(|accountApi\.createUser\(|accountApi\.removeUser\(/);
    assert.match(history, /accountApi\.workHistory\(\)/);
    assert.doesNotMatch(history, /accountApi\.closedShifts\(\)|accountApi\.currentShift\(\)/);
    assert.match(account, /workHistory: \(\) => apiRequest<PersonalWorkHistory>\("\/profile\/work-history"\)/);
    assert.match(history, /Incomplete punch/);
    assert.match(history, /Recorded hours by month/);
    assert.match(history, /Recorded hours by shift/);
    assert.match(history, /<strong>\{totals\.recordedShifts\}<\/strong>/);
    assert.match(history, /The chart excludes unavailable hours/);
    assert.match(history, /Includes verified historical hours/);
    assert.match(history, /Historical entries show total hours only, not clock-in\/out times/);
    assert.match(account, /verified_date_totals_included/);
    assert.doesNotMatch(history, /accountApi\.listUsers\(|accountApi\.createUser\(|accountApi\.removeUser\(/);
    for (const [name, source] of [["Profile", profile], ["StaffWorkHistory", history]]) {
        assert.equal(ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX).parseDiagnostics.length, 0);
    }
});

test("History is strictly associated by numeric user ID, never name matches", () => {
    const sameNames = shift(10, "2026-10-14", "closed", {
        staff_hours: [{ user_id: 7, name: "Alex", seconds: 7200 }],
        staff_drinks: [{ staff_id: 7, staff_name: "Alex", drink_name: "Beer", quantity: 2 }],
    });
    assert.deepEqual(buildStaffActivity(8, [sameNames], null), []);
    const own = buildStaffActivity(7, [sameNames], null);
    assert.equal(own[0].hoursSeconds, 7200);
    assert.equal(own[0].drinks[0].quantity, 2);
});

test("Missing hours are unknown, not false zero, while legitimate zero duration is recorded", () => {
    const drinksOnly = shift(1, "2026-10-09", "closed", {
        staff_drinks: [{ staff_id: 5, drink_name: "Tea", quantity: 1 }],
    });
    const justClockedIn = shift(2, "2026-10-10", "open", {
        staff_hours: [{ user_id: 5, seconds: 0 }],
        punches: [{ user_id: 5, clock_out: null }],
    });
    const results = buildStaffActivity(5, [drinksOnly], justClockedIn);
    assert.equal(results.length, 2);
    assert.equal(results[0].hoursSeconds, 0);
    assert.equal(results[0].clockedIn, true);
    assert.equal(results[1].hoursSeconds, null);
    assert.equal(recordedStaffTotals([results[1]]).hoursSeconds, null);
});

test("Only the current open shift is appended and shift IDs are not counted twice", () => {
    const old = shift(2, "2026-10-10", "closed", {
        staff_hours: [{ user_id: 4, seconds: 3600 }],
    });
    const live = shift(2, "2026-10-10", "open", {
        staff_hours: [{ user_id: 4, seconds: 5400 }],
    });
    const rows = buildStaffActivity(4, [old], live);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "open");
    assert.equal(recordedStaffTotals(rows).hoursSeconds, 5400);
});

test("Summaries count drinks/shift records without inventing unrecorded history", () => {
    const rows = buildStaffActivity(3, [
        shift(1, "2026-09-19", "closed", {
            staff_hours: [{ user_id: 3, seconds: 7200 }],
            staff_drinks: [{ staff_id: 3, drink_name: "Water", quantity: 3 }],
        }),
        shift(2, "2026-09-20", "closed", {
            staff_hours: [{ user_id: 3, seconds: 3600 }],
        }),
        shift(3, "2026-09-21", "closed", {
            staff_hours: [{ user_id: 7, seconds: 1000 }],
        }),
    ], null);
    assert.equal(rows.length, 2);
    assert.deepEqual(recordedStaffTotals(rows), {
        recordedShifts: 2, hoursSeconds: 10800, hoursShifts: 2, drinkCount: 3, drinksShifts: 1,
    });
    assert.equal(rows[0].businessDate, "2026-09-20");
    assert.equal(recordedStaffTotals([]).drinkCount, null);
});

test("Frontend keeps personal compensation separate and labels verified historical totals", () => {
    assert.doesNotMatch(history, /StaffIncome/);
    assert.doesNotMatch(history, /Not available yet|Bonuses & adjustments|benefits/);
    assert.match(history, /means unavailable, not zero/);
    assert.doesNotMatch(history, /\/payroll/);
});
