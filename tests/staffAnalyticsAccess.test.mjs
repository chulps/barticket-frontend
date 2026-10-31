import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const header = readFileSync(new URL("../src/layout/Header.tsx", import.meta.url), "utf8");
const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");

test("staff can find Analytics in mobile and desktop navigation", () => {
    const parsed = ts.createSourceFile("Header.tsx", header, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.equal(parsed.parseDiagnostics.length, 0);
    assert.match(header, /<SecondaryNavLink[\s\S]*?to="\/analytics"/);
    assert.match(header, /<MoreLink to="\/analytics"/);
    assert.doesNotMatch(header, /\{isManager \? \(\s*<SecondaryNavLink[^\n]*to="\/analytics"/);
    assert.doesNotMatch(header, /\{isManager \? \(\s*<MoreLink to="\/analytics"/);
});

test("staff can render the same Analytics page without manager privileges", () => {
    const parsed = ts.createSourceFile("Analytics.tsx", analytics, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.equal(parsed.parseDiagnostics.length, 0);
    assert.match(analytics, /\{account && shifts \? \(/);
    assert.doesNotMatch(analytics, /if \(me\.role !== "manager"\) return/);
    assert.doesNotMatch(analytics, /account\?\.role === "manager" && shifts/);
    assert.match(analytics, /if \(me\.role === "manager"\) \{\s*const members = await accountApi\.listUsers\(\)/);
    assert.match(analytics, /accountApi\.analyticsShifts\(\)/);
    assert.match(analytics, /<AnalyticsReportActions/);
    assert.match(analytics, /err\.status === 403/);
});
