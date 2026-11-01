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


test("Admin sections reuse Analytics' shared state and geometry contract", () => {
    const analytics = readFileSync(new URL("../src/pages/Analytics.tsx", import.meta.url), "utf8");
    assert.match(admin, /import TabGroup from "\.\.\/components\/TabGroup"/);
    assert.match(analytics, /<TabGroup/);
    assert.match(admin, /<SectionNav[^>]*aria-label=/);
    assert.match(admin, /responsiveColumns=\{adminSectionColumns\}/);
    assert.match(admin, /minWidth: 0, columns: 2/);
    assert.match(admin, /minWidth: 640, columns: 3/);
    assert.match(admin, /minWidth: 1000, columns: 6/);
    assert.match(admin, /@media \(max-width: 569px\) \{ display: none;/);
    assert.match(admin, /select value=\{activeSection\}/);
    assert.doesNotMatch(admin, /SectionIndicator|SectionButton|sectionNavRef|tabIndicator/);
    assert.doesNotMatch(admin, /background: var\(--royal|box-shadow: 0 0 0 1px var\(--royal/);
    assert.match(shared, /background: var\(--neutral-800\)/);
    assert.match(shared, /&:hover, &:active \{\s*transform: none;/);
    assert.match(shared, /&:hover \{\s*background: unset;/);
    assert.match(shared, /&:focus-visible \{\s*outline: 2px solid var\(--royal-400\)/);
    assert.match(shared, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(shared, /activeIndex >= 0 && indicator.width > 0/);
    const parsed = ts.createSourceFile("Admin.tsx", admin, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), []);
});
