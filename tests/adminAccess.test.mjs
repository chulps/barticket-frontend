import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
const profile = readFileSync(new URL("../src/pages/Profile.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/layout/Header.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");

test("Admin and its parent components parse as TSX", () => {
    for (const [name, code] of [["Admin", admin], ["Profile", profile], ["Header", header], ["App", app]]) {
        const file = ts.createSourceFile(name + ".tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.equal(file.parseDiagnostics.length, 0, name);
    }
});

test("Admin is restricted to manager role and manager-only API", () => {
    assert.match(admin, /me\?\.role !== "manager"/);
    assert.match(admin, /<Navigate to="\/profile" replace/);
    assert.match(admin, /accountApi\.listUsers\(\)/);
    assert.match(header, /\{isManager \? \(\s*<SecondaryNavLink[^\n]*to="\/admin"/);
    assert.match(header, /\{isManager \? \(\s*<MoreLink to="\/admin"/);
    assert.match(app, /<Route path="\/admin"/);
});

test("Profile no longer exposes account creation and deletion", () => {
    assert.doesNotMatch(profile, /accountApi\.createUser\(/);
    assert.doesNotMatch(profile, /accountApi\.removeUser\(/);
    assert.doesNotMatch(profile, /accountApi\.listUsers\(/);
});
