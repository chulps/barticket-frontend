import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const editors = readFileSync(new URL("../src/pages/AdminTeamEditors.tsx", import.meta.url), "utf8");
const shared = readFileSync(new URL("../src/components/TabGroup.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");

test("Staff settings reuse the Admin shared three-tab control", () => {
    assert.match(editors, /import TabGroup from "\.\.\/components\/TabGroup"/);
    assert.match(editors, /<TabGroup\b/);
    for (const id of ["terms", "time", "drinks"]) {
        assert.match(editors, new RegExp('\\{ id: "' + id + '", label:'));
    }
    for (const label of ["Pay & rates", "Time corrections", "Drink bonuses"]) {
        assert.ok(editors.includes(label));
    }
    assert.match(editors, /activeTab=\{tab\}/);
    assert.match(editors, /onChange=\{setTab\}/);
    assert.doesNotMatch(editors, /EditorTabs/);
    assert.match(shared, /transition: transform/);
    assert.match(editors, /<StaffTabSurface>[\s\S]*<TabGroup[\s\S]*<\/StaffTabSurface>/);
    assert.match(editors, /const StaffTabSurface = styled\.div`[\s\S]*background: var\(--neutral-900\)/);
    assert.doesNotMatch(shared, /background: var\(--neutral-900\)/);
});

test("Staff editor keeps its three issue-scoped tabs and parses as TSX", () => {
    for (const tab of ["terms", "time", "drinks"]) {
        assert.ok(editors.includes('tab === "' + tab + '"'));
    }
    const parsed = ts.createSourceFile("AdminTeamEditors.tsx", editors, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), []);
});


test("Admin section tabs keep the animated selection aligned in the responsive grid", () => {
    assert.match(admin, /<SectionIndicator/);
    assert.match(admin, /new ResizeObserver\(measure\)/);
    assert.match(admin, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(admin, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(admin, /&:focus-visible \{ outline: 2px solid var\(--royal-400\)/);
    const parsed = ts.createSourceFile("Admin.tsx", admin, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), []);
});
