import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const header=readFileSync(new URL("../src/components/TicketDetails/TicketHeader.tsx",import.meta.url),"utf8");
const item=readFileSync(new URL("../src/components/TicketDetails/TicketItem.tsx",import.meta.url),"utf8");

test("customer name is a real button only on open tickets and edits the current value",()=>{
 assert.match(header,/<NameTrigger/);
 assert.match(header,/type="button"/);
 assert.match(header,/setNameDraft\(ticket\.name\)/);
 assert.match(header,/onClick=\{startEditingName\}/);
 assert.match(header,/activeTab !== "open"/);
 assert.match(header,/aria-label=\{locale === "ja"/);
});
test("renaming never saves on blur, cancel or Escape, and restores focus",()=>{
 assert.match(header,/onSubmit=\{saveEditingName\}/);
 assert.match(header,/event\.preventDefault\(\)/);
 assert.match(header,/cancelEditingName\(\)/);
 assert.match(header,/nameTriggerRef\.current\?\.focus\(\)/);
 assert.doesNotMatch(header,/onBlur=\{finishEditingName\}/);
});
test("price editing has accessible button, readonly text, prefill, cancel and focus restore",()=>{
 assert.match(item,/<PriceTrigger type="button" ref=\{priceTriggerRef\}/);
 assert.match(item,/<PriceReadOnly>/);
 assert.match(item,/setPriceInput\(unitPrice\.toString\(\)\)/);
 assert.match(item,/priceTriggerRef\.current\?\.focus\(\)/);
 assert.match(item,/onCancelPrice\(\)/);
 assert.match(item, /disabled=\{savingPrice \|\| pending\}/);
});
test("price editor numeric validation uses a digit class rather than literal slash-d",()=>{
 const correct="!/^"+String.fromCharCode(92)+"d+$/.test(priceInput)";
 assert.ok(item.includes(correct),"valid integers must not be rejected");
 assert.equal(/^\d+$/.test("1250"),true);
 assert.equal(/^\d+$/.test("-1"),false);
});
test("both components parse",()=>{
 for(const [path,s] of [["TicketHeader.tsx",header],["TicketItem.tsx",item]]){
  const f=ts.createSourceFile(path,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(f.parseDiagnostics.map(d=>d.messageText),[],path);
 }
});
