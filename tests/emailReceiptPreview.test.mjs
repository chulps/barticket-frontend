import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const file=readFileSync(new URL("../src/components/TicketDetails/ReceiptPreview.tsx",import.meta.url),"utf8");
const action=readFileSync(new URL("../src/components/TicketDetails/TicketActions.tsx",import.meta.url),"utf8");
const output=ts.transpileModule(file,{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
}).outputText;
const validators=output.match(/function validReceiptEmail[\s\S]*?function receiptPreviewText/);
assert.ok(validators);
const script=validators[0].replace(/function receiptPreviewText$/,"");
const m={exports:{}};
runInNewContext(script+"\nmodule.exports.validReceiptEmail=validReceiptEmail;",{module:m,exports:m.exports});
const {validReceiptEmail}=m.exports;

test("email is only validated, never sent or persisted",()=>{
 assert.equal(validReceiptEmail("customer@example.com"),true);
 assert.equal(validReceiptEmail("broken-address"),false);
 assert.equal(validReceiptEmail("a@@b.com"),false);
 assert.match(file,/Send email — unavailable/);
 assert.match(file,/navigator\.clipboard\.writeText\(receiptPreviewText\(ticket, locale\)\)/);
 assert.doesNotMatch(file,/apiRequest|fetch\(/);
});
test("receipt preview uses ticket line snapshots and does not invent paid total",()=>{
 assert.match(file,/ticket\.items\.reduce/);
 assert.match(file,/item\.subtotal/);
 assert.match(file,/authoritative paid total/);
 assert.match(file,/Payment time not verified/);
});
test("paid ticket email action opens preview rather than inert click",()=>{
 assert.match(action,/content: <ReceiptPreview ticket=\{ticket\} \/>/);
 assert.match(action,/Email receipt — preview/);
});
test("receipt and ticket actions remain parsable",()=>{
 for(const [path,s] of [["ReceiptPreview.tsx",file],["TicketActions.tsx",action]]){
 const diagnostics=ts.createSourceFile(path,s,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics;
 assert.deepEqual(diagnostics.map(d=>d.messageText),[],path);
 }
});
