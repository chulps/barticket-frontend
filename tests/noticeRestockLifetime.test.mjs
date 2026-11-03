import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/pages/Notifications.tsx',import.meta.url),'utf8');
const start=source.indexOf('    async function restock(noticeId: number)');
const handler=source.slice(start,source.indexOf('\n    return (',start));
const lifetime=source.slice(source.indexOf('    const restockLifetime ='),source.indexOf('    useEffect(() => {\n        let cancelled = false;',source.indexOf('    const restockLifetime =')));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}};
const flush=()=>new Promise(r=>setImmediate(r));
function harness(){
 const post=deferred(),read=deferred();let token='A';const cleanups=[];const events=[],alerts=[],states=[];let reads=0;const window=new EventTarget();window.addEventListener('barticket-notices',()=>events.push('notices'));window.alert=text=>alerts.push(text);window.setInterval=()=>1;window.clearInterval=()=>{};
 const context={useRef:current=>({current}),useEffect:fn=>{cleanups.push(fn())},pendingRestock:{current:false},revision:{current:0},notices:{notices:[{id:1}]},timeOffApi:{inbox:()=>Promise.resolve([])},shouldPoll:()=>true,setTimeOffItems:()=>{},setPendingNoticeId:id=>states.push(['pending',id]),setNotices:value=>states.push(['notices',value]),getToken:()=>token,dismissRestockNotice:()=>({notices:[]}),restockNotice:()=>post.promise,listNotices:()=>{reads++;return read.promise},window,Event,console:{warn:()=>{}},ApiError:class extends Error{},t:x=>x};
 vm.createContext(context);vm.runInContext(ts.transpile(lifetime+'\n'+handler+'\nglobalThis.run=restock;'),context);
 return {post,read,events,alerts,states,reads:()=>reads,run:()=>context.run(1),auth:next=>{token=next;window.dispatchEvent(new Event('barticket-auth'))},unmount:()=>cleanups.forEach(cleanup=>cleanup?.())};
}
for(const outcome of ['success','failure'])for(const change of ['account','same-token','unmount'])test(`old restock ${outcome} has no late actions after ${change}`,async()=>{
 const h=harness();const done=h.run();if(change==='unmount')h.unmount();else h.auth(change==='account'?'B':'A');const stateCount=h.states.length;
 if(outcome==='success')h.post.resolve({notices:[]});else h.post.reject(new Error('old failure'));await done;
 assert.equal(h.states.length,stateCount);assert.equal(h.events.length,0);assert.equal(h.alerts.length,0);assert.equal(h.reads(),0);
});
test('current-session restock still publishes success and clears pending state',async()=>{
 const h=harness();const done=h.run();h.post.resolve({notices:[]});await done;assert.ok(h.events.length>0);assert.equal(h.alerts.length,0);assert.deepEqual(h.states.at(-1),['pending',null]);
});
test('current-session failure still rolls back, alerts and reconciles without retrying POST',async()=>{
 const h=harness();const done=h.run();h.post.reject(new Error('failure'));await flush();assert.equal(h.alerts.length,1);assert.equal(h.reads(),1);h.read.resolve({notices:[{id:1}]});await done;assert.ok(h.events.length>0);assert.deepEqual(h.states.at(-1),['pending',null]);
});
test('reconciliation result and finally cannot act after auth change during the recovery GET',async()=>{
 const h=harness();const done=h.run();h.post.reject(new Error('failure'));await flush();h.auth('B');const stateCount=h.states.length;h.read.resolve({notices:[{id:1}]});await done;assert.equal(h.states.length,stateCount);assert.equal(h.events.length,0);
});
