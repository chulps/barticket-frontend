import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=readFileSync(new URL('../src/pages/AdminMonthlyPayOverview.tsx',import.meta.url),'utf8');
const team=readFileSync(new URL('../src/pages/AdminTeam.tsx',import.meta.url),'utf8');
const code=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
function moduleAt(path){const module={exports:{}};vm.runInNewContext(code(readFileSync(new URL(path,import.meta.url),'utf8')),{module,exports:module.exports});return module.exports;}
const {createPendingRead}=moduleAt('../src/api/pendingRead.ts');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
class ApiError extends Error{constructor(status){super(`Error ${status}`);this.status=status;}}
function fixture(){
 let token='A',index=0,effectIndex=0;const values=[],effects=[],tasks=[],calls=[];const window=new EventTarget();
 const hooks={useState(initial){const i=index++;if(!(i in values))values[i]=initial;return[values[i],value=>{values[i]=typeof value==='function'?value(values[i]):value}]},useRef(initial){const i=index++;if(!(i in values))values[i]={current:initial};return values[i]},useMemo(fn){return fn()},useEffect(fn,deps){const i=effectIndex++;const prior=effects[i];if(!prior||deps.some((v,j)=>!Object.is(v,prior.deps[j]))){tasks.push(()=>{prior?.cleanup?.();effects[i]={deps,cleanup:fn()}})}}};
 const request=(id,month)=>new Promise((resolve,reject)=>calls.push({id,month,resolve:()=>resolve({user_id:id,month}),reject}));
 const api={adminPersonalEarnings:request,adminChuckMonthlyPay:month=>request(901,month)};
 const styled=new Proxy(()=>{},{get:()=>()=>()=>null});const module={exports:{}};
 const require=id=>id==='react'?hooks:id==='styled-components'?{default:styled,__esModule:true}:id==='react/jsx-runtime'?{jsx:()=>null,jsxs:()=>null}:id.endsWith('/account')?{accountApi:api}:id.endsWith('/client')?{getToken:()=>token,ApiError}:id.endsWith('/pendingRead')?{createPendingRead}:id.endsWith('/i18n')?{localeTag:()=> 'en-US'}:id.includes('managerRevenueShareAccess')?{readRevenueShareViewers:()=>({chuckUserId:901,noriUserId:902})}:id.includes('adminMonthlyPayDisplay')?{staffPayRow:(person,data)=>({person,month:data.month,complete:false}),managerPayRow:(person,data)=>({person,month:data.month,complete:false}),totalStaffPay:()=>null}:{default:()=>null};
 vm.runInNewContext(code(source),{require,module,exports:module.exports,window});
 let props={viewer:{id:901,role:'manager',name:'Manager'},people:[{id:901,role:'manager',name:'Manager'},{id:903,role:'staff',name:'Staff'}],month:'2026-11',locale:'en',refreshVersion:0};
 function render(next={}){props={...props,...next};index=effectIndex=0;module.exports.default(props);tasks.splice(0).forEach(fn=>fn())}
 return {render,calls,values,window,props:()=>props,token:value=>{token=value},resolveAll:()=>calls.forEach(c=>c.resolve())};
}
test('pay retains same-scope content during focus and coalesces overlapping identical scopes only',async()=>{
 const h=fixture();h.render();await flush();assert.equal(h.calls.length,2);h.resolveAll();await flush();const snapshot=h.values[0];assert.equal(snapshot.rows.length,2);
 h.render({viewer:{...h.props().viewer},people:h.props().people.map(p=>({...p}))});await flush();assert.equal(h.calls.length,4);assert.equal(h.values[0],snapshot);assert.equal(h.values[1],true);
 h.render({viewer:{...h.props().viewer},people:h.props().people.map(p=>({...p}))});await flush();assert.equal(h.calls.length,4,'pending focus read reused');h.resolveAll();await flush();assert.equal(h.values[1],false);
 h.render({locale:'ja'});await flush();assert.equal(h.calls.length,4,'locale alone does not fetch');
});
test('manual refresh and pay-input invalidation retire pending work rather than reuse pre-write data',async()=>{
 const h=fixture();h.render();await flush();h.render({refreshVersion:1});await flush();assert.equal(h.calls.length,4);
 h.window.dispatchEvent(new Event('barticket-analytics-updated'));h.render();await flush();assert.equal(h.calls.length,6);h.calls.slice(0,4).forEach(c=>c.resolve());await flush();assert.equal(h.values[0],null);h.calls.slice(4).forEach(c=>c.resolve());await flush();assert.equal(h.values[0].rows.length,2);
});
test('month, roster and token scopes never accept old completions; denied refresh clears private rows',async()=>{
 const h=fixture();h.render();await flush();h.render({month:'2026-10'});await flush();h.calls.slice(2).forEach(c=>c.resolve());await flush();assert.equal(h.values[0].rows[0].month,'2026-10');h.calls.slice(0,2).forEach(c=>c.resolve());await flush();assert.equal(h.values[0].rows[0].month,'2026-10');
 h.render({people:[{id:904,role:'staff',name:'New staff'}]});await flush();assert.equal(h.calls.length,5);h.token('B');h.window.dispatchEvent(new Event('barticket-auth'));h.calls[4].resolve();await flush();assert.equal(h.values[0],null);
 h.render({viewer:{id:902,role:'manager',name:'Other manager'}});await flush();h.calls[5].resolve();await flush();assert.equal(h.values[0].rows[0].person.id,904);
 h.render({refreshVersion:2});await flush();h.calls[6].reject(new ApiError(403));await flush();assert.equal(h.values[0],null);assert.equal(h.values[2],true);
});
test('failed background refresh no longer certifies old amounts',async()=>{
 const h=fixture();h.render();await flush();h.resolveAll();await flush();h.render({refreshVersion:1});await flush();h.calls.slice(2).forEach(c=>c.reject(new Error('unavailable')));await flush();assert.equal(h.values[2],true);assert.equal(h.values[0].rows.every(r=>r.complete===false&&r.owed===null),true);
});
test('history is gated by actual member consumers, not broad pay-view disabling',()=>{
 assert.match(team,/const needsHistory = person !== null && \(memberView === "activity" \|\| person.role === "staff" \|\|/);
 assert.match(team,/canSeeChuckRevenueShare\(viewer, person.id, revenueShareViewers\)\)/);
 assert.match(team,/if \(!needsHistory\) \{ setLoading\(false\); return; \}/);
 assert.match(team,/\[refreshKey, needsHistory\]/);assert.doesNotMatch(team,/\[refreshKey, ja\]/);
});

test('same-token auth revalidation and token ABA retire pending results and start a replacement',async()=>{
 const h=fixture();h.render();await flush();h.window.dispatchEvent(new Event('barticket-auth'));h.render();await flush();assert.equal(h.calls.length,4);h.calls.slice(0,2).forEach(c=>c.resolve());await flush();assert.equal(h.values[0],null);h.calls.slice(2).forEach(c=>c.resolve());await flush();assert.equal(h.values[0].rows.length,2);
 h.render({refreshVersion:1});await flush();h.token('B');h.window.dispatchEvent(new Event('barticket-auth'));h.token('A');h.window.dispatchEvent(new Event('barticket-auth'));h.render();await flush();assert.equal(h.calls.length,8);h.calls.slice(4,6).forEach(c=>c.resolve());await flush();assert.equal(h.values[0],null);h.calls.slice(6).forEach(c=>c.resolve());await flush();assert.equal(h.values[0].rows.length,2);
});
