import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
const policy = readFileSync(new URL("../src/pages/adminAccountRole.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(policy, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { confirmAccountRole } = await import("data:text/javascript," + encodeURIComponent(transpiled));

test("Admin renders Accounts, Team, historical hours, and spreadsheet schedules", () => {
    assert.match(admin, /<SectionNav\b[^>]*aria-label=/);
    assert.doesNotMatch(admin, /id: "overview"/);
    assert.match(admin, /visibleSectionTabs\.map/);
    assert.match(admin, /<TabGroup/);
    assert.match(admin, /activeTab=\{activeSection\}/);
    assert.match(admin, /onChange=\{chooseSection\}/);
    assert.match(admin, /responsiveColumns=\{adminSectionColumns\}/);
    for (const section of ["accounts", "team", "schedules"]) {
        assert.match(admin, new RegExp(`\\{ id: "${section}", label:`));
    }
    assert.match(admin, /\{ id: "historicalHours", label:/);
    for (const later of ["shifts", "payroll", "settings"]) {
        assert.doesNotMatch(admin, new RegExp(`section === "${later}"`));
    }
    assert.match(admin, /accountApi\.closedShifts\(/);
    assert.doesNotMatch(admin, /accountApi\.currentShift\(/);
    assert.match(admin, /<ScheduleImport users=\{team\} locale=\{locale\} \/>/);
});

test("Account creation and deletion still use existing manager-only APIs", () => {
    assert.match(admin, /me\?\.role !== "manager"/);
    assert.match(admin, /accountApi\.listUsers\(\)/);
    assert.match(admin, /accountApi\.createUser\(/);
    assert.match(admin, /accountApi\.removeUser\(/);
    assert.match(admin, /confirmAccountRole\(role, locale/);
    assert.match(admin, /window\.confirm\(t\("removePersonConfirm"/);
});

test("Creating staff requires no elevated role confirmation", () => {
    let calls = 0;
    assert.equal(confirmAccountRole("staff", "en", () => { calls++; return false; }), true);
    assert.equal(calls, 0);
});

test("Creating a manager requires explicit confirmation and can be cancelled", () => {
    const messages = [];
    assert.equal(confirmAccountRole("manager", "en", message => { messages.push(message); return false; }), false);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Admin/);
    assert.equal(confirmAccountRole("manager", "en", () => true), true);
});

test("Manager confirmation text supports Japanese", () => {
    let message = "";
    assert.equal(confirmAccountRole("manager", "ja", prompt => { message = prompt; return false; }), false);
    assert.match(message, /管理者権限/);
});

test("Admin TSX parses without syntax errors", () => {
    const parsed = ts.createSourceFile("Admin.tsx", admin, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), []);
});
