import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
const directory = readFileSync(new URL("../src/pages/AdminTeam.tsx", import.meta.url), "utf8");
const editors = readFileSync(new URL("../src/pages/AdminTeamEditors.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/api/account.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/pages/adminTeamDrafts.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const {
    validDate, validInteger, validHours,
    validRateDraft, validDrinkbackDraft, validHoursDraft, validBonusDraft,
} = await import("data:text/javascript," + encodeURIComponent(transpiled));

test("Admin team is manager-only, including direct staff detail links", () => {
    assert.match(admin, /me\?\.role !== "manager"/);
    assert.match(admin, /<Navigate to="\/profile" replace/);
    assert.match(app, /path="\/admin\/staff\/:staffId".*<Admin/);
    assert.match(admin, /<AdminTeam/);
    assert.match(admin, /selectedId={selectedId}/);
    assert.match(admin, /\/admin\/staff\/\$\{id\}/);
    assert.match(directory, /people\.find\(member => member\.id === selectedId\)/);
    assert.doesNotMatch(directory, /accountApi\.listUsers\(/);
});

test("Team time corrections use the audited API; unsupported pay writes remain disabled", () => {
    assert.match(directory, /accountApi\.shiftHistory\(\)/);
    assert.doesNotMatch(directory, /accountApi\.currentShift\(\)/);
    assert.match(directory, /buildStaffActivity\(person\.id, closed, current\)/);
    assert.match(directory, /drink\.staff_id === person\.id/);
    for (const source of [directory, editors]) {
        assert.doesNotMatch(source, /accountApi\.(?:createUser|updateMe|removeUser|clockIn|clockOut|openShift|closeShift)/);
        assert.doesNotMatch(source, /apiRequest\(|\bfetch\(|localStorage|sessionStorage|axios|\/admin\/staff\/\$\{.*\}\/pay/);
    }
    assert.match(editors, /accountApi\.correctPunch/);
    assert.match(editors, /Save correction/);
    assert.match(editors, /createStaffDrinkBonusAdjustment/);
    assert.match(editors, /Only managers can change rates, correct clock punches or adjust drink bonuses/);
    assert.match(editors, /accountApi\.hourlyRates\(person\.id\)/);
    assert.match(editors, /accountApi\.previewHourlyRate/);
    assert.match(editors, /accountApi\.setHourlyRate/);
    assert.match(account, /\/admin\/staff-compensation\/users\/\$\{userId\}\/hourly-rates/);
    assert.match(account, /\/admin\/staff-compensation\/hourly-rates\/preview/);
    assert.match(account, /\/admin\/staff-compensation\/hourly-rates/);
    assert.match(account, /\/shifts\/\$\{shiftId\}\/punches\/\$\{punchId\}\/corrections/);
    assert.match(editors, /window\.confirm/);
    assert.match(editors, /Impact preview \(unrounded estimate\)/);
});

test("UI components and draft helpers parse as TypeScript", () => {
    const punchHelper = readFileSync(new URL("../src/pages/adminPunchCorrections.ts", import.meta.url), "utf8");
    for (const [name, contents, kind] of [
        ["Punch correction helpers", punchHelper, ts.ScriptKind.TS],
        ["Admin", admin, ts.ScriptKind.TSX],
        ["AdminTeam", directory, ts.ScriptKind.TSX],
        ["AdminTeamEditors", editors, ts.ScriptKind.TSX],
        ["Account API", account, ts.ScriptKind.TS],
        ["AdminTeamDrafts", source, ts.ScriptKind.TS],
    ]) {
        const parsed = ts.createSourceFile(name + ".tsx", contents, ts.ScriptTarget.Latest, true, kind);
        assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), [], name);
    }
});

test("Strict whole-yen amount and real calendar dates", () => {
    assert.equal(validDate("2026-02-29"), false);
    assert.equal(validDate("2024-02-29"), true);
    assert.equal(validDate("2026-10-15"), true);
    assert.equal(validInteger("1300"), true);
    assert.equal(validInteger("-500"), false);
    assert.equal(validInteger("-500", true), true);
    assert.equal(validInteger("12.5"), false);
    assert.equal(validInteger(""), false);
});

test("A draft pay rate needs explicit basis, date and reason; no universal salary default", () => {
    const basis = { basis: "hourly", hourlyYen: "1300", effectiveFrom: "2026-10-15", reason: "Annual review" };
    assert.equal(validRateDraft(basis), true);
    assert.equal(validRateDraft({ ...basis, hourlyYen: "-1" }), false);
    assert.equal(validRateDraft({ ...basis, basis: "" }), false);
    assert.equal(validRateDraft({ ...basis, effectiveFrom: "" }), false);
    assert.equal(validRateDraft({ ...basis, reason: "" }), false);
    assert.equal(validRateDraft({ ...basis, basis: "manager", hourlyYen: "" }), true);
});

test("Drinkback draft supports none, fixed yen or percent only with effective dates", () => {
    const draft = { mode: "fixed", amount: "400", effectiveFrom: "2026-10-15", reason: "New terms" };
    assert.equal(validDrinkbackDraft(draft), true);
    assert.equal(validDrinkbackDraft({ ...draft, mode: "percentage", amount: "50" }), true);
    assert.equal(validDrinkbackDraft({ ...draft, mode: "percentage", amount: "105" }), false);
    assert.equal(validDrinkbackDraft({ ...draft, mode: "none", amount: "" }), true);
    assert.equal(validDrinkbackDraft({ ...draft, mode: "" }), false);
});

test("Time corrections and bonuses cannot target someone else's shift or write invalid amounts", () => {
    assert.equal(validHours("6.25"), true);
    assert.equal(validHours("25"), false);
    assert.equal(validHours("6.333"), false);
    const hrs = { shiftId: "47", correctedHours: "5.5", reason: "Timesheet review" };
    assert.equal(validHoursDraft(hrs, [47]), true);
    assert.equal(validHoursDraft(hrs, [48]), false);
    assert.equal(validHoursDraft({ ...hrs, reason: "" }, [47]), false);
    const bonus = { shiftId: "47", adjustmentYen: "-200", reason: "Reversal" };
    assert.equal(validBonusDraft(bonus, [47]), true);
    assert.equal(validBonusDraft({ ...bonus, adjustmentYen: "0" }, [47]), false);
    assert.equal(validBonusDraft({ ...bonus, adjustmentYen: "200.25" }, [47]), false);
    assert.equal(validBonusDraft(bonus, [99]), false);
});
