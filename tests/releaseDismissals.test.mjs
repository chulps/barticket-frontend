import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source=readFileSync(new URL('../src/api/releaseDismissals.ts',import.meta.url),'utf8');
const module=()=>{const m={exports:{}};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,Set,JSON,Error,Number});return m.exports;};
const ids=Array.from({length:12},(_,index)=>`${100-index}:1`);
const normalize=value=>JSON.parse(JSON.stringify(value));
function makeStorage(seed={}) {
 const rows=new Map(Object.entries(seed));
 return {rows,getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};
}

test('dismissals persist per account and cannot alter the release ledger',()=>{
 const {loadDismissedReleaseIds,saveDismissedReleaseIds}=module();
 const storage=makeStorage({'release-history.json':JSON.stringify({schema:1,releases:ids})});
 saveDismissedReleaseIds(7,[ids[0],ids[1]],ids,storage);
 const persisted=JSON.parse(storage.getItem('barticket:release-dismissals:v1:7'));
 assert.deepEqual(persisted,{schema:1,accountId:7,dismissedIds:ids.slice(0,2)});
 assert.deepEqual(normalize(loadDismissedReleaseIds(7,ids,storage)),{dismissedIds:ids.slice(0,2),repaired:false});
 assert.deepEqual(normalize(loadDismissedReleaseIds(8,ids,storage)),{dismissedIds:[],repaired:false});
 assert.deepEqual(JSON.parse(storage.getItem('release-history.json')),{schema:1,releases:ids});
 assert.deepEqual([...storage.rows.keys()].sort(),['barticket:release-dismissals:v1:7','release-history.json'].sort());
});

test('dismiss all covers every current release and a later release is not auto-dismissed',()=>{
 const {loadDismissedReleaseIds,saveDismissedReleaseIds}=module();
 const storage=makeStorage();
 saveDismissedReleaseIds(7,ids,ids,storage);
 const withNew=[`${200}:1`,...ids];
 assert.deepEqual(normalize(loadDismissedReleaseIds(7,withNew,storage)),{dismissedIds:ids,repaired:false});
 assert.equal(withNew.filter(id=>!loadDismissedReleaseIds(7,withNew,storage).dismissedIds.includes(id)).length,1);
});

test('stale IDs are pruned to the current ledger and kept in stable release order by the caller',()=>{
 const {loadDismissedReleaseIds,saveDismissedReleaseIds}=module();
 const storage=makeStorage();
 saveDismissedReleaseIds(7,[ids[0],ids[1],ids[2]],ids,storage);
 const loaded=loadDismissedReleaseIds(7,[ids[0],ids[2]],storage);
 assert.deepEqual(normalize(loaded),{dismissedIds:[ids[0],ids[2]],repaired:true});
 assert.deepEqual(JSON.parse(storage.getItem('barticket:release-dismissals:v1:7')).dismissedIds,[ids[0],ids[2]]);
});

test('malformed and oversized dismissal data fails closed without hiding releases',()=>{
 const {loadDismissedReleaseIds}=module();
 for(const value of ['not-json',JSON.stringify({schema:1,accountId:8,dismissedIds:[ids[0]]}),JSON.stringify({schema:1,accountId:7,dismissedIds:['bad']})]) {
  const storage=makeStorage({'barticket:release-dismissals:v1:7':value});
  assert.deepEqual(normalize(loadDismissedReleaseIds(7,ids,storage)),{dismissedIds:[],repaired:true});
 }
 const oversized=makeStorage({'barticket:release-dismissals:v1:7':'x'.repeat(512*1024+1)});
 assert.deepEqual(normalize(loadDismissedReleaseIds(7,ids,oversized)),{dismissedIds:[],repaired:true});
});

test('storage failures are reported and dismissal records are bounded to ledger IDs',()=>{
 const {loadDismissedReleaseIds,saveDismissedReleaseIds}=module();
 assert.throws(()=>loadDismissedReleaseIds(7,ids,{getItem(){throw new Error('denied')},setItem(){}}),/denied/);
 assert.throws(()=>saveDismissedReleaseIds(7,[`${999}:1`],ids,makeStorage()),/Invalid release dismissal list/);
 assert.throws(()=>saveDismissedReleaseIds(0,[],ids,makeStorage()),/Invalid account identity/);
 assert.throws(()=>saveDismissedReleaseIds(7,Array.from({length:10001},(_,i)=>`${10000+i}:1`),Array.from({length:10001},(_,i)=>`${10000+i}:1`),makeStorage()),/Invalid release dismissal list/);
 assert.throws(()=>saveDismissedReleaseIds(7,[ids[0]],ids,{getItem(){return null},setItem(){throw new Error('quota')}}),/quota/);
});

