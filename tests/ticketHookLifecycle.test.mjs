import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
let moduleId=0;
async function moduleFor(name,deps={}) {
 let code=ts.transpileModule(readFileSync(new URL('../src/hooks/'+name+'.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const key='__ticketHookTest'+moduleId++;globalThis[key]=deps;
 code=code.replace(/^import .*?;\n/gm,'');
 const prefix=`const {${Object.keys(deps).join(',')}}=globalThis[${JSON.stringify(key)}];\n`;
 const result=await import('data:text/javascript,'+encodeURIComponent(prefix+code));delete globalThis[key];return result;
}
const delta=await moduleFor('ticketDelta');
const safety=await moduleFor('refreshSafety');
const policy=await moduleFor('ticketRefreshPolicy');
const optimistic=await moduleFor('optimisticTickets');
const background=await moduleFor('backgroundRefresh');
const scopes=await moduleFor('ticketReadScope');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function runtime(){
 const states=[],effects=[];const win=new EventTarget(),doc=new EventTarget();
 const timers=new Map(),intervals=new Map();let next=0;
 win.navigator={onLine:true};doc.visibilityState='visible';
 win.setTimeout=fn=>{timers.set(++next,fn);return next;};win.clearTimeout=id=>timers.delete(id);
 win.setInterval=fn=>{intervals.set(++next,fn);return next;};win.clearInterval=id=>intervals.delete(id);
 globalThis.window=win;globalThis.document=doc;
 const hooks={useState:initial=>{const i=states.length;states.push(initial);return [initial,value=>states[i]=typeof value==='function'?value(states[i]):value];},useRef:current=>({current}),useEffect:fn=>effects.push(fn)};
 return {win,doc,states,hooks,start:()=>effects.splice(0).map(f=>f()),emit:detail=>win.dispatchEvent(new CustomEvent('barticket-push',{detail})),
 flush:async()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());await settle();}};
}
const row=(id,name='old',shiftId=3)=>({id,name,status:'open',shiftId,items:[{id:1,type:'menu',quantity:1,subtotal:10,unit_price:10}],payment:null});
async function ticketsHarness(api){
 const r=runtime();let token='A';
 const {useTickets}=await moduleFor('useTickets',{...r.hooks,...delta,...safety,...policy,...optimistic,
 ApiError:class extends Error{},getToken:()=>token,shouldPoll:()=>false,ticketsApi:api,toTicket:x=>x,COVER_ITEM_ID:0,
 readLocale:()=> 'en',useI18n:()=>({t:x=>x,locale:'en'}),notifyMutation:()=>{},provisionalTicket:()=>{},resolveProvisionalTicket:()=>{},removeProvisionalTicket:()=>{}});
 const actions=useTickets(3),cleanups=r.start();await settle();return {...r,actions,rows:()=>r.states[0],token:value=>token=value,cleanup:()=>cleanups.forEach(f=>f?.())};
}
test('hint during held full read gets one trailing authoritative ID read, duplicate hints coalesce',async()=>{
 const first=deferred();let gets=0;
 const h=await ticketsHarness({list:()=>first.promise,get:async()=>{gets++;return row(11,'new');}});
 h.emit({eventType:'ticket_updated',ticketId:11});h.emit({eventType:'ticket_updated',ticketId:11});await h.flush();assert.equal(gets,0);
 first.resolve([row(11)]);await settle();await h.flush();assert.equal(gets,1);assert.equal(h.rows()[0].name,'new');h.cleanup();
});
test('local write during background read rejects old snapshot then resyncs without replaying POST',async()=>{
 let lists=0,posts=0;const held=deferred(),write=deferred();
 const h=await ticketsHarness({list:()=>{lists++;return lists===2?held.promise:Promise.resolve([row(11,lists===1?'old':'saved')]);},updateItem:()=>{posts++;return write.promise;}});
 h.win.dispatchEvent(new Event('focus'));await settle();h.actions.updateItemQuantity(11,1,1);await settle();assert.equal(posts,1);
 held.resolve([row(11,'stale')]);await settle();await h.flush();assert.equal(h.rows()[0].name,'old');
 write.resolve(row(11,'saved'));await settle();await h.flush();assert.equal(h.rows()[0].name,'saved');assert.equal(posts,1);assert.equal(lists,3);h.cleanup();
});
test('hidden hints defer reads; visibility return performs full scope resync',async()=>{
 let lists=0,gets=0;const h=await ticketsHarness({list:async()=>{lists++;return [row(11)];},get:async()=>{gets++;return row(11);}});
 h.doc.visibilityState='hidden';h.emit({eventType:'ticket_updated',ticketId:11});await h.flush();assert.equal(gets,0);
 h.doc.visibilityState='visible';h.doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(lists,2);h.cleanup();
});
test('account switch rejects a prior account response',async()=>{
 const held=deferred();const h=await ticketsHarness({list:()=>held.promise});h.token('B');held.resolve([row(11,'private A')]);await settle();assert.deepEqual(h.rows(),[]);h.cleanup();
});
test('Analytics period A response arriving after B cannot replace B snapshot',async()=>{
 const r=runtime(),a=deferred(),b=deferred();
 const {useAnalyticsTickets}=await moduleFor('useAnalyticsTickets',{...r.hooks,...background,...scopes,getToken:()=> 'A',shouldPoll:()=>false,toTicket:x=>x,ticketsApi:{list:scope=>scope.date_from==='2026-10-01'?a.promise:b.promise}});
 useAnalyticsTickets('day','2026-10-01',true);const [stopA]=r.start();await r.flush();stopA();
 // A new effect generation (as React does on a changed period); setters remain observable.
 r.states.length=0;
 useAnalyticsTickets('day','2026-10-02',true);const stops=r.start();await r.flush();b.resolve([row(2,'B')]);await settle();a.resolve([row(1,'A')]);await settle();
 assert.equal(r.states[0].key,'day:2026-10-02');assert.equal(r.states[0].rows[0].name,'B');stops.forEach(f=>f?.());
});

test('scoped report hook rejects old range response and never requests full history for daily view',async()=>{
 const r=runtime(),a=deferred(),b=deferred(),calls=[];
 const {useAnalyticsReports}=await moduleFor('useAnalyticsReports',{...r.hooks,...background,...scopes,getToken:()=> 'A',shouldPoll:()=>false,
 accountApi:{analyticsShifts:scope=>{calls.push(scope);return scope.date_from==='2026-10-01'?a.promise:b.promise;}}});
 useAnalyticsReports('day','2026-10-01',true);const [stopA]=r.start();await r.flush();stopA();r.states.length=0;
 useAnalyticsReports('month','2026-11',true);const stops=r.start();await r.flush();
 b.resolve([{id:2,business_date:'2026-11-01'}]);await settle();a.resolve([{id:1,business_date:'2026-10-01'}]);await settle();
 assert.deepEqual(calls,[{date_from:'2026-10-01',date_to:'2026-10-01'},{date_from:'2026-11-01',date_to:'2026-11-30'}]);
 assert.equal(r.states[0].key,'month:2026-11');assert.equal(r.states[0].rows[0].id,2);stops.forEach(f=>f?.());
});
