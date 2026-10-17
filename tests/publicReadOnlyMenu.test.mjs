import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const app = read("src/App.tsx");
const menu = read("src/pages/Menu.tsx");
const header = read("src/layout/Header.tsx");
const row = read("src/components/MenuItemRow.tsx");
const api = read("src/api/menu.ts");

test("Public menu route renders for both guest and authenticated viewers", () => {
    assert.match(app, /path="\/menu" element=\{authenticated === null \? null : <Menu/);
    assert.match(app, /authenticated=\{authenticated\}/);
    const menuRoute = app.slice(app.indexOf('<Route path="/menu"'), app.indexOf('<Route path="/analytics"'));
    assert.doesNotMatch(menuRoute, /<Navigate to="\/" replace/);
    assert.match(header, /<PublicMenuLink to="\/menu"/);
});

test("Guests receive no add, stock, or price editing controls", () => {
    assert.match(menu, /\{authenticated \? <HeaderActions>/);
    assert.match(menu, /onSaveItem=\{authenticated \? onSaveItem : undefined\}/);
    assert.match(menu, /onArchive=\{authenticated \? archiveItem : undefined\}/);
    assert.match(menu, /if \(!authenticated \|\| archivedLoading\) return/);
    assert.match(menu, /onToggleStock=\{authenticated \? toggleStock : undefined\}/);
    assert.match(menu, /onSavePrices=\{authenticated \? savePrices : undefined\}/);
    assert.doesNotMatch(menu, /getToken\(|signedIn/);
    assert.match(row, /\{onToggle && !pending \? \(/);
    assert.match(api, /apiRequest<MenuData>\("\/menu"\)/);
});

test("Changed React files parse as TSX", () => {
    for (const [name, source] of [["App", app], ["Menu", menu], ["Header", header]]) {
        const parsed = ts.createSourceFile(name + ".tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), [], name);
    }
});
