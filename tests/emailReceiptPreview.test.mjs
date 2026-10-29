import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const file=readFileSync(new URL("../src/components/TicketDetails/ReceiptPreview.tsx",import.meta.url),"utf8");
const utils=readFileSync(new URL("../src/components/TicketDetails/receiptEmailUtils.ts",import.meta.url),"utf8");
const action=readFileSync(new URL("../src/components/TicketDetails/TicketActions.tsx",import.meta.url),"utf8");
const output=ts.transpileModule(utils,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
}).outputText;
const m={exports:{}};
runInNewContext(output,{module:m,exports:m.exports,require:()=>({localeTag:locale=>locale})});
const {validReceiptEmail}=m.exports;

test("email is validated and sent through the authenticated API with an idempotency key",()=>{
 assert.equal(validReceiptEmail("customer@example.com"),true);
 assert.equal(validReceiptEmail("broken-address"),false);
 assert.equal(validReceiptEmail("a@@b.com"),false);
 assert.match(file,/ticketsApi\.emailReceipt\(ticket\.id, email\.trim\(\), locale, sendKey\.current\)/);
 assert.match(file,/crypto\.randomUUID\(\)/);
 assert.match(file,/navigator\.clipboard\.writeText\(receiptPreviewText\(ticket, locale\)\)/);
 assert.match(file,/setOutcomeUnknown\(true\)/);
 assert.match(readFileSync(new URL("../src/api/tickets.ts",import.meta.url),"utf8"),/Idempotency-Key/);
});
test("receipt preview uses ticket line snapshots and does not invent paid total",()=>{
 assert.match(utils,/ticket\.items\.reduce/);
 assert.match(utils,/line\.subtotal/);
 assert.match(file,/ticket\.serverTotal/);
 assert.match(file,/Payment time not verified/);
});
test("paid ticket email action opens the send form",()=>{
 assert.match(action,/content: <ReceiptPreview ticket=\{ticket\} \/>/);
 assert.match(action,/Email receipt/);
});
test("receipt and ticket actions remain parsable",()=>{
 for(const [path,s] of [["ReceiptPreview.tsx",file],["TicketActions.tsx",action]]){
 const diagnostics=ts.createSourceFile(path,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics;
 assert.deepEqual(diagnostics.map(d=>d.messageText),[],path);
 }
});
