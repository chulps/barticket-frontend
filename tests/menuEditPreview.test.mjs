import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source=readFileSync(new URL("../src/components/MenuItemForm.tsx",import.meta.url),"utf8");
test("menu edit draft accepts digits and rejects non-numeric price strings",()=>{
 const expected="!/^"+String.fromCharCode(92,92)+"d+$/.test(raw)";
 const correct="!/^"+String.fromCharCode(92)+"d+$/.test(raw)";
 assert.ok(source.includes(correct),"edit draft must use a digit character class");
 assert.ok(!source.includes(expected),"escaped digit class would reject numeric values");
 assert.equal(/^\d+$/.test("1200"),true);
 assert.equal(/^\d+$/.test("-20"),false);
 assert.equal(/^\d+$/.test("12.5"),false);
});
test("edit preview cannot POST the missing item-update endpoint",()=>{
 assert.match(source,/if \(editingItem\) return;/);
 assert.match(source,/Save — unavailable/);
 assert.match(source,/Copy draft JSON/);
});
test("menu edit form parses",()=>{
 const parsed=ts.createSourceFile("MenuItemForm.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
});
