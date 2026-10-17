import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const file=(path)=>readFileSync(new URL("../src/"+path,import.meta.url),"utf8");
const admin=file("pages/Admin.tsx");
const header=file("layout/Header.tsx");
const modal=file("context/ModalProvider.tsx");

test("Admin removes sensitive team data while revalidating an account",()=>{
  assert.match(admin,/setLoading\(true\);\s*setMe\(null\);\s*setTeam\(\[\]\)/);
  assert.match(admin,/if \(account\.role !== "manager"\)/);
  assert.match(admin,/getToken\(\) !== token/);
  assert.match(admin,/window\.addEventListener\("barticket-auth", reload\)/);
  assert.match(admin,/window\.addEventListener\("focus", reload\)/);
});
test("cross-session responses cannot restore manager-only navigation",()=>{
  assert.match(header,/request !== generation \|\| getToken\(\) !== token/);
  assert.match(header,/setIsManager\(false\)/);
  assert.match(header,/setAlertCount\(0\)/);
});
test("modal provider dismisses old account content even with a dirty guard",()=>{
  assert.match(modal,/window\.addEventListener\("barticket-auth", clearSessionModal\)/);
  assert.match(modal,/guardRef\.current = null;\s*setModal\(null\)/);
  assert.match(modal,/removeEventListener\("barticket-auth", clearSessionModal\)/);
});
test("changed UI modules parse correctly",()=>{
  for(const path of ["pages/Admin.tsx","layout/Header.tsx","context/ModalProvider.tsx"]){
    const ast=ts.createSourceFile(path,file(path),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(ast.parseDiagnostics.map(d=>d.messageText),[],path);
  }
});
