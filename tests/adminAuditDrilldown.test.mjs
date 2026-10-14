import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const admin = read("src/pages/Admin.tsx");
const team = read("src/pages/AdminTeam.tsx");
const editors = read("src/pages/AdminTeamEditors.tsx");
const activity = read("src/pages/AdminShiftActivity.tsx");
const audit = read("src/pages/AdminAuditHistory.tsx");
const app = read("src/App.tsx");

test("Manager profiles including Chuck and Nori omit staff pay, time, and bonus editors", () => {
    assert.match(team, /const isStaffProfile = person\?\.role === "staff"/);
    assert.match(team, /!loading && !loadError && isStaffProfile/);
    assert.match(team, /\{isStaffProfile \? <Metric>/);
    assert.match(team, /<AdminManagerShare/);
    assert.match(team, /canSeeChuckRevenueShare\(viewer, person\.id, revenueShareViewers\)/);
    assert.doesNotMatch(team, /person\.name === ["']Chuck/);
    assert.match(editors, /Pay & rates/);
    assert.match(editors, /Time corrections/);
    assert.match(editors, /Drink bonuses/);
});

test("Audit history is a distinct manager-only screen with a back link, not an editor tab", () => {
    assert.match(app, /path="\/admin\/staff\/:staffId\/audit"/);
    assert.match(admin, /me\?\.role !== "manager"/);
    assert.match(admin, /useMatch\("\/admin\/staff\/:staffId\/audit"\)/);
    assert.match(admin, /<AdminAuditHistory/);
    assert.match(team, /View audit history/);
    assert.match(team, /onAudit\(person\.id\)/);
    assert.doesNotMatch(editors, /tab === "audit"|type EditorTab = [^\n]*audit/);
    assert.match(audit, /No history can be retrieved yet/);
    assert.doesNotMatch(audit, /apiRequest\(|\bfetch\(|accountApi\./);
});

test("Activity drill-down navigates years, months and expandable nights without a 20-shift cutoff", () => {
    assert.match(team, /<AdminShiftActivity/);
    assert.doesNotMatch(team, /filteredActivity\.slice\(0, 20\)/);
    assert.match(activity, /const PAGE_SIZE = 12/);
    assert.match(activity, /<Groups aria-label=.*Choose year/);
    assert.match(activity, /<Groups aria-label=.*Choose month/);
    assert.match(activity, /monthRows\.slice\(0, visible\)/);
    assert.match(activity, /<Night key=\{row\.shiftId\}>/);
    assert.match(activity, /<summary>/);
    assert.match(activity, /<Back.*Show 12 more shifts/s);
    assert.match(activity, /onMonthChange\(value\)/);
    assert.doesNotMatch(activity, /accountApi\.|apiRequest\(|\bfetch\(/);
});

test("Admin and new screens parse as TSX", () => {
    for (const [name, source] of [["Admin", admin], ["AdminTeam", team],
        ["AdminTeamEditors", editors], ["AdminShiftActivity", activity], ["AdminAuditHistory", audit]]) {
        const parsed = ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.deepEqual(parsed.parseDiagnostics.map(item => item.messageText), [], name);
    }
});
