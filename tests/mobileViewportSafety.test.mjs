import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const read = path => readFileSync(new URL("../src/"+path, import.meta.url), "utf8");
const actions=read("components/TicketDetails/TicketActions.tsx");
const picker=read("components/AddItemPicker.tsx");
const modal=read("components/ModalHost.tsx");
const board=read("pages/Dashboard.tsx");
test("mobile close controls keep keyboard order consistent with visual order",()=>{
  assert.match(actions, /flex-direction: column;/);
  assert.doesNotMatch(actions, /flex-direction: column-reverse/);
  assert.match(actions, /min-height: 44px/);
  assert.match(actions, /confirmCancellation/);
});
test("search remains reachable while selected rows scroll separately from the menu",()=>{
  assert.match(picker, /SearchBarContainer = styled\.div/);
  assert.match(picker, /position: sticky; top: 0; z-index: 5/);
  assert.match(picker, /flex: 1 1 0; overflow-y: auto/);
  assert.match(picker, /max-height: min\(22dvh, 180px\)/);
  assert.match(picker, /padding-bottom: calc\(var\(--space-2\) \+ env\(safe-area-inset-bottom, 0px\)\)/);
});
test("modal and ticket details respect reduced visual viewport and iOS safe areas",()=>{
  assert.match(modal, /height: 100dvh/);
  assert.match(modal, /max-height: calc\(100dvh - env\(safe-area-inset-top, 0px\)\)/);
  assert.match(modal, /-webkit-overflow-scrolling: touch/);
  assert.match(board, /scroll-padding-bottom: calc\(80px \+ env\(safe-area-inset-bottom, 0px\)\)/);
});
test("all modified TSX parses",()=>{
 for(const path of ["components/TicketDetails/TicketActions.tsx","components/AddItemPicker.tsx","components/ModalHost.tsx","pages/Dashboard.tsx"]){
  const f=ts.createSourceFile(path,read(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  assert.deepEqual(f.parseDiagnostics.map(d=>d.messageText),[],path);
 }
});
