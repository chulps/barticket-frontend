import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../src/api/sessionRead.ts",import.meta.url),"utf8");
const code = ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createSessionRead} = await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
test("session reads coalesce pending requests and reuse only a brief successful handoff",async()=>{
  let calls=0,clock=0;
  const d=deferred();
  const reader=createSessionRead(()=>"A",()=>{calls++;return calls===1?d.promise:Promise.resolve({id:1});},()=>clock);
  const a=reader.read(),b=reader.read();
  assert.equal(a,b);assert.equal(calls,1);
  d.resolve({id:1});await a;
  clock=999;await reader.read();assert.equal(calls,1);
  clock=1000;await reader.read();assert.equal(calls,2);
});
test("failed verification is not cached",async()=>{
  let calls=0;
  const reader=createSessionRead(()=>"A",async()=>{calls++;if(calls===1)throw new Error("401");return {id:1};});
  await assert.rejects(reader.read(),/401/);
  assert.deepEqual(await reader.read(),{id:1});assert.equal(calls,2);
});
test("token switches retire old reads even if the original token later returns",async()=>{
  let token="A";
  const pending=[];
  const reader=createSessionRead(()=>token,()=>{const d=deferred();pending.push(d);return d.promise;});
  const old=reader.read();const rejected=assert.rejects(old,/Session changed/);
  token="B";const other=reader.read();const otherRejected=assert.rejects(other,/Session changed/);
  token="A";const current=reader.read();
  pending[0].resolve({id:1});pending[1].resolve({id:2});pending[2].resolve({id:1,new:true});
  await Promise.all([rejected,otherRejected]);
  assert.deepEqual(await current,{id:1,new:true});
  assert.equal(reader.read(),current);
});
test("invalidation retires pending results and does not discard a newer success",async()=>{
  const pending=[];
  const reader=createSessionRead(()=>"A",()=>{const d=deferred();pending.push(d);return d.promise;});
  const old=reader.read();const rejected=assert.rejects(old,/Session changed/);
  reader.invalidate();
  const current=reader.read();
  pending[1].resolve({role:"staff"});await current;
  pending[0].resolve({role:"manager"});await rejected;
  assert.equal(reader.read(),current);
});
test("focus revalidation refreshes settled data but coalesces a pending same-session check",async()=>{
  const pending=[];
  const reader=createSessionRead(()=>"A",()=>{const d=deferred();pending.push(d);return d.promise;});
  const first=reader.read();
  reader.revalidate();
  assert.equal(reader.read(),first);
  pending[0].resolve({id:1});await first;
  reader.revalidate();
  const second=reader.read();
  assert.notEqual(second,first);
  reader.revalidate();
  assert.equal(reader.read(),second);
  pending[1].resolve({id:1});await second;
});
