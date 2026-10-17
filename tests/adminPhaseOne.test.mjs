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

test("Admin renders Overview, Accounts and frontend-only Team, not unfinished phase tabs", () => {
    assert.match(admin, /import TabGroup from "\.\.\/components\/TabGroup"/);
    assert.match(admin, /<TabGroup\b/);
    assert.match(admin, /activeTab=\{activeSection\}/);
    assert.match(admin, /onChange=\{chooseSection\}/);
    for (const section of ["overview", "accounts", "team"]) {
        assert.match(admin, new RegExp(`\\{ id: "${section}", label:`));
    }
    for (const later of ["shifts", "history", "payroll", "settings"]) {
        assert.doesNotMatch(admin, new RegExp(`section === "${later}"`));
    }
    assert.doesNotMatch(admin, /accountApi\.closedShifts\(/);
    assert.doesNotMatch(admin, /accountApi\.currentShift\(/);
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
