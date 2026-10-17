import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read=p=>readFileSync(new URL("../src/"+p,import.meta.url),"utf8");
const ui=read("components/RequestState.tsx");
const paths=["pages/Menu.tsx","pages/Dashboard.tsx","pages/Admin.tsx","pages/Profile.tsx","pages/Analytics.tsx"];
test("common English/Japanese loading empty offline error and forbidden states",()=>{
 for(const k of ["loading","empty","forbidden","offline","error","failed-save"])assert.ok(ui.includes(k));
 assert.match(ui, /locale === "ja"/);
 assert.match(ui, /aria-live=\{warning \? "assertive" : "polite"\}/);
 assert.match(ui, /role=\{warning \? "alert" : "status"\}/);
});
test("status retry does not itself issue or replay a financial request",()=>{
 assert.match(ui,/onClick=\{onRetry\}/);
 assert.doesNotMatch(ui,/ticketsApi|accountApi|closeShift|payTicket|fetch\(/);
 assert.match(ui, /kind !== "loading"/);
});
test("ticket menu admin analytics and profile adopt shared status rendering",()=>{
 for(const p of paths){
  const s=read(p);
  assert.match(s,/import RequestState from "\.\.\/components\/RequestState"/);
  assert.match(s,/<RequestState/);
 }
 assert.match(read("pages/Menu.tsx"),/onRetry=\{menuError \? retryMenu : undefined\}/);
 assert.match(read("pages/Dashboard.tsx"),/kind="loading"/);
});
test("component and screen edits parse",()=>{
 for(const p of ["components/RequestState.tsx",...paths]){
  const ast=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(ast.parseDiagnostics.map(d=>d.messageText),[],p);
 }
});
