import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = name => fs.readFileSync(new URL('../src/'+name,import.meta.url),'utf8');
function module(sourceText, dependencies, globals={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(sourceText,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:id=>dependencies[id],...globals});return exports;
}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function noticesFixture(){
 let token='A';const requests=[];const window=new EventTarget();
 const client={getToken:()=>token,apiRequest:(path,options)=>{const d=deferred();requests.push({path,options,...d});return d.promise;}};
 const session=module(source('api/sessionRead.ts'),{});
 const api=module(source('api/notices.ts'),{'./client':client,'./sessionRead':session},{window});
 return{api,requests,window,setToken:value=>{token=value;window.dispatchEvent(new Event('barticket-auth'));}};
}
test('notices share pending reads but never a settled response or failed request',async()=>{
 const f=noticesFixture();const a=f.api.listNotices(),b=f.api.listNotices();assert.equal(a,b);assert.equal(f.requests.length,1);
 f.requests[0].resolve({notices:[]});await a;
 const c=f.api.listNotices();assert.equal(f.requests.length,2);f.requests[1].reject(new Error('503'));await assert.rejects(c,/503/);
 const d=f.api.listNotices();assert.equal(f.requests.length,3);f.requests[2].resolve({notices:[]});await d;
});
test('notice invalidation retires old reads and concurrent consumers share next epoch',async()=>{
 const f=noticesFixture();const old=f.api.listNotices();const denied=assert.rejects(old,/Session changed/);
 f.window.dispatchEvent(new Event('barticket-notices'));const a=f.api.listNotices(),b=f.api.listNotices();assert.equal(a,b);
 f.requests[1].resolve({notices:['current']});assert.deepEqual(await a,{notices:['current']});f.requests[0].resolve({notices:['old']});await denied;
});
test('notice reads wait for restock and old pre-write data cannot win',async()=>{
 const f=noticesFixture();const old=f.api.listNotices();const denied=assert.rejects(old,/Session changed/);
 const write=f.api.restockNotice(5);const a=f.api.listNotices(),b=f.api.listNotices();assert.equal(f.requests.length,2);
 f.requests[0].resolve({notices:['old']});await denied;f.requests[1].resolve({notices:[]});await write;await tick();assert.equal(f.requests.length,3);
 f.requests[2].resolve({notices:[]});await Promise.all([a,b]);
});
test('auth change during restock wait and pending notice read retires old session',async()=>{
 const f=noticesFixture();const first=f.api.listNotices();const rejected=assert.rejects(first,/Session changed/);f.setToken('B');f.requests[0].resolve({notices:[]});await rejected;
 const write=f.api.restockNotice(4);const waiting=f.api.listNotices();const obsolete=assert.rejects(waiting,/Session changed/);f.setToken(null);f.requests[1].resolve({notices:[]});await write;await obsolete;assert.equal(f.requests.length,2);
});
function receivablesFixture(){
 let token='A',locale='en',index=0,effects=[],dirty=[];const states=[],memo=[],refs=[],requests=[];let accounts=0;
 const hooks={useState(initial){const i=index++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}]},useRef(initial){const i=index++;return refs[i]??=( {current:initial})},useCallback(fn,deps){const i=index++;if(!memo[i]||deps.some((v,j)=>v!==memo[i].deps[j]))memo[i]={fn,deps};return memo[i].fn;},useEffect(fn,deps){const i=index++;if(!effects[i]||deps.some((v,j)=>v!==effects[i].deps[j]))dirty.push({i,fn,deps});}};
 const window=new EventTarget();window.setTimeout=setTimeout;window.clearTimeout=clearTimeout;
 const styled=new Proxy(()=>{}, {get:()=>()=>()=>null});const deps={react:hooks,'styled-components':{default:styled,__esModule:true},'react/jsx-runtime':{jsx:()=>null,jsxs:()=>null},'../components/settlementLabels':{unpaidReasonOptions:()=>[],unpaidReasonLabel:()=>'',settlementLabel:()=>''},'../components/paymentMethods':{},'../components/PaymentDateHistory':{},'../api/account':{accountApi:{me:async()=>{accounts++;return{id:1,role:'manager'}}}},'../api/tickets':{ticketsApi:{receivables:query=>{const d=deferred();requests.push({query,...d});return d.promise;}},toTicket:x=>({...x,items:[]})},'../api/client':{getToken:()=>token,ApiError:Error},'../components/PaymentModal':{},'../i18n':{useI18n:()=>({locale})},'../hooks/useModal':{useModal:()=>({openModal(){}})}};
 const Component=module(source('pages/Receivables.tsx'),deps,{window,URLSearchParams}).default;
 function render(){index=0;dirty=[];Component();for(const item of dirty){effects[item.i]?.cleanup?.();effects[item.i]={deps:item.deps,cleanup:item.fn()};}}
 return{render,requests,states,window,accounts:()=>accounts,setLocale:value=>{locale=value;},setToken:value=>{token=value;window.dispatchEvent(new Event('barticket-auth'));},cleanup:()=>effects.forEach(e=>e?.cleanup?.())};
}
test('receivables newer filter wins; filter and locale do not re-request identity',async()=>{
 const f=receivablesFixture();f.render();await new Promise(r=>setTimeout(r,5));assert.equal(f.accounts(),1);assert.equal(f.requests.length,1);
 f.states[2]='settled';f.render();await new Promise(r=>setTimeout(r,5));assert.equal(f.requests.length,2);assert.equal(f.accounts(),1);
 f.requests[1].resolve({items:[{id:2,total:0}],total:1});await tick();f.requests[0].resolve({items:[{id:1,total:0}],total:1});await tick();assert.equal(f.states[0][0].id,2);
 f.setLocale('ja');f.render();await tick();assert.equal(f.requests.length,2);assert.equal(f.accounts(),1);f.cleanup();
});
test('receivables logout clears rows and rejects pending old session; unmount prevents completion',async()=>{
 const f=receivablesFixture();f.render();await new Promise(r=>setTimeout(r,5));f.setToken(null);assert.equal(f.states[0].length,0);f.requests[0].resolve({items:[{id:1,total:0}],total:1});await tick();assert.equal(f.states[0].length,0);
 f.setToken('B');const current=f.requests.at(-1);f.cleanup();current.resolve({items:[{id:2,total:0}],total:1});await tick();assert.equal(f.states[0].length,0);
});
test('profile locale is display-only, not earnings/history request identity',()=>{
 for(const file of ['StaffIncome.tsx','StaffWorkHistory.tsx']){
 const s=source('pages/'+file);assert.doesNotMatch(s,/\[.*refreshKey, ja/);assert.doesNotMatch(s,/identity = .*\$\{ja\}/);assert.match(s,/errorMessage = error ===/);
 }
});
test('failed restock unblocks one fresh shared reconciliation read without retrying POST',async()=>{
 const f=noticesFixture();const write=f.api.restockNotice(5);const failed=assert.rejects(write,/503/);const a=f.api.listNotices(),b=f.api.listNotices();f.requests[0].reject(new Error('503'));await failed;await tick();assert.equal(f.requests.length,2);assert.equal(f.requests.filter(r=>r.options?.method==='POST').length,1);f.requests[1].resolve({notices:['authoritative']});assert.deepEqual(await a,{notices:['authoritative']});await b;
});
test('receivables same-scope focus retains rows while refresh runs, then current result wins',async()=>{
 const f=receivablesFixture();f.render();await new Promise(r=>setTimeout(r,5));f.requests[0].resolve({items:[{id:1,total:0}],total:1});await tick();f.window.dispatchEvent(new Event('focus'));assert.equal(f.states[0][0].id,1);assert.equal(f.requests.length,2);f.requests[1].resolve({items:[{id:2,total:0}],total:1});await tick();assert.equal(f.states[0][0].id,2);f.cleanup();
});
test('old account restock neither blocks nor invalidates the new account read',async()=>{
 const f=noticesFixture();const write=f.api.restockNotice(5);f.setToken('B');const current=f.api.listNotices();assert.equal(f.requests.length,2);f.requests[0].resolve({notices:['old account']});await write;assert.equal(f.api.listNotices(),current);f.requests[1].resolve({notices:['B']});assert.deepEqual(await current,{notices:['B']});
});
test('returning to same token after auth change does not inherit an older write barrier',async()=>{
 const f=noticesFixture();const write=f.api.restockNotice(5);f.setToken('B');f.setToken('A');const current=f.api.listNotices();assert.equal(f.requests.length,2);f.requests[0].resolve({notices:['old session']});await write;assert.equal(f.api.listNotices(),current);f.requests[1].resolve({notices:['current']});await current;
});
