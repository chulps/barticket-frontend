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
const motion=await moduleFor('ticketListMotion');
const safety=await moduleFor('refreshSafety');
const policy=await moduleFor('ticketRefreshPolicy');
const optimistic=await moduleFor('optimisticTickets');
const operations=await moduleFor('optimisticOperations');
const background=await moduleFor('backgroundRefresh');
const scopes=await moduleFor('ticketReadScope');
const recovery=await moduleFor('../components/paymentAttemptRecovery');
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
 const r=runtime();let token='A';recovery.paymentAttemptRecovery.clear();
 const {useTickets}=await moduleFor('useTickets',{...r.hooks,...delta,...safety,...policy,...optimistic,...recovery,...motion,
 ApiError:class extends Error{},getToken:()=>token,shouldPoll:()=>false,ticketsApi:api,toTicket:x=>x,COVER_ITEM_ID:0,
 readLocale:()=> 'en',useI18n:()=>({t:x=>x,locale:'en'}),notifyMutation:()=>{},...operations});
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


test('payment queued behind rename never sends after session change',async()=>{
 const rename=deferred();let payPosts=0,reads=0;
 const h=await ticketsHarness({list:async()=>[row(11)],rename:()=>rename.promise,pay:async()=>{payPosts++;return row(11);},get:async()=>{reads++;return row(11);}});
 h.actions.updateTicketName(11,'renamed');
 const intent=recovery.paymentAttemptRecovery.remember(11,{key:'fixture-payment',method:'cash',amount:10});
 const payment=h.actions.payTicket(11,'cash',10,intent.key);await settle();
 recovery.paymentAttemptRecovery.clear();h.token('B');
 rename.resolve(row(11,'renamed'));await payment;await settle();
 assert.equal(payPosts,0);assert.equal(reads,0);h.cleanup();
});
test('payment failure after auth switch never reconciles under replacement account',async()=>{
 let reject,reads=0;const failed=new Promise((_,r)=>reject=r);
 const h=await ticketsHarness({list:async()=>[row(11)],pay:()=>failed,get:async()=>{reads++;return row(11);}});
 const intent=recovery.paymentAttemptRecovery.remember(11,{key:'fixture-payment',method:'cash',amount:10});
 const payment=h.actions.payTicket(11,'cash',10,intent.key);await settle();
 recovery.paymentAttemptRecovery.clear();h.token('B');reject(new Error('fixture lost response'));
 assert.equal(await payment,null);assert.equal(reads,0);h.cleanup();
});
test('exact unresolved key may replay after reconciliation to paid; unrelated paid writes stay blocked',async()=>{
 let posts=0;const paid={...row(11),status:'paid',balanceDue:0};
 const h=await ticketsHarness({list:async()=>[paid],pay:async()=>{posts++;return paid;}});
 assert.equal(await h.actions.payTicket(11,'cash',10,'new-untracked'),null);
 const intent=recovery.paymentAttemptRecovery.remember(11,{key:'fixture-payment',method:'cash',amount:10});
 assert.equal(await h.actions.payTicket(11,'cash',10,intent.key),null); // fresh intent cannot bypass closed status
 recovery.paymentAttemptRecovery.markUncertain(intent);
 assert.equal(await h.actions.payTicket(11,'card',10,intent.key),null);
 assert.equal(await h.actions.payTicket(11,'cash',10,intent.key),paid);assert.equal(posts,1);h.cleanup();
});


test('a surfaced payment rejection does not poison the ordered queue for explicit retry',async()=>{
 let calls=0;const saved={...row(11),status:'paid',balanceDue:0};
 const h=await ticketsHarness({list:async()=>[row(11)],pay:async()=>{if(++calls===1)throw new Error('fixture uncertain response');return saved;},get:async()=>row(11)});
 const intent=recovery.paymentAttemptRecovery.remember(11,{key:'fixture-payment',method:'cash',amount:10});
 await assert.rejects(h.actions.payTicket(11,'cash',10,intent.key),/fixture uncertain/);
 assert.equal(await h.actions.payTicket(11,'cash',10,intent.key),saved);assert.equal(calls,2);h.cleanup();
});

test('only live accepted snapshots produce targeted new/status moves, never same-status edits',async()=>{
 let rows=[row(11)];const h=await ticketsHarness({list:async()=>rows});
 assert.equal(h.states[3].source,'initial');assert.deepEqual(h.states[3].moves,[]);
 rows=[{...row(11),status:'paid'},row(12)];h.emit({live:true});await settle();
 assert.equal(h.states[3].source,'live');
 assert.deepEqual(h.states[3].moves,[{id:12,from:null,to:'open'},{id:11,from:'open',to:'paid'}]);
 rows=[row(11),{...row(12),status:'cancelled'}];h.emit({live:true});await settle();
 assert.deepEqual(h.states[3].moves,[{id:12,from:'open',to:'cancelled'},{id:11,from:'paid',to:'open'}]);
 rows=[row(11,'renamed'),{...row(12),status:'cancelled'}];h.emit({live:true});await settle();
 assert.deepEqual(h.states[3].moves,[]);h.cleanup();
});
test('reconnect, focus and hidden backfill remain quiet; a later fresh change is eligible',async()=>{
 let rows=[row(11)];const h=await ticketsHarness({list:async()=>rows});
 rows.push(row(12));h.emit({live:false});await settle();assert.equal(h.states[3].source,'quiet');assert.deepEqual(h.states[3].moves,[]);
 h.doc.visibilityState='hidden';h.doc.dispatchEvent(new Event('visibilitychange'));
 rows.push(row(13));h.emit({live:true});await settle();
 h.doc.visibilityState='visible';h.doc.dispatchEvent(new Event('visibilitychange'));await settle();
 assert.equal(h.states[3].source,'quiet');assert.deepEqual(h.states[3].moves,[]);
 rows.push(row(14));h.emit({live:true});await settle();assert.deepEqual(h.states[3].moves,[{id:14,from:null,to:'open'}]);h.cleanup();
});
test('a held live response interrupted by reconnect or hiding cannot produce lifecycle motion',async()=>{
 for(const interrupt of ['reconnect','hidden']) {
  let response=null;const h=await ticketsHarness({list:()=>response??Promise.resolve([row(11)])});
  const held=deferred();response=held.promise;h.emit({live:true});await settle();
  if(interrupt==='reconnect') h.emit({live:false});
  else {h.doc.visibilityState='hidden';h.doc.dispatchEvent(new Event('visibilitychange'));}
  held.resolve([row(11),row(12)]);await settle();assert.equal(h.states[3].source,'quiet');assert.deepEqual(h.states[3].moves,[]);h.cleanup();
 }
});
test('confirmed local status change is not replayed when a live invalidation reconciles it',async()=>{
 let rows=[row(11)];const h=await ticketsHarness({list:async()=>rows,cancel:async()=>{rows=[{...row(11),status:'cancelled'}];return rows[0];}});
 await h.actions.cancelTicket(11);assert.equal(h.states[3].source,'local');
 h.emit({live:true});await settle();assert.deepEqual(h.states[3].moves,[]);h.cleanup();
});

test('fresh server push before socket animates once; replay and stale pushes remain quiet',async()=>{
 let rows=[row(11)];const h=await ticketsHarness({list:async()=>rows,get:async id=>rows.find(r=>r.id===id)});
 const detail={eventType:'ticket_created',ticketId:12,eventId:'11111111-1111-4111-8111-111111111111',occurredAt:Date.now()/1000};
 rows.push(row(12));h.emit(detail);await h.flush();assert.deepEqual(h.states[3].moves,[{id:12,from:null,to:'open'}]);
 h.emit({live:true});await settle();assert.deepEqual(h.states[3].moves,[]);
 h.emit(detail);await h.flush();assert.equal(h.states[3].source,'quiet');assert.deepEqual(h.states[3].moves,[]);
 rows.push(row(13));h.emit({...detail,ticketId:13,eventId:'22222222-2222-4222-8222-222222222222',occurredAt:(Date.now()-60000)/1000});await h.flush();
 assert.equal(h.states[3].source,'quiet');assert.deepEqual(h.states[3].moves,[]);h.cleanup();
});

test('a mixed fresh and stale ID batch conservatively suppresses backfill animation',async()=>{
 let rows=[row(11)];const h=await ticketsHarness({list:async()=>rows,get:async id=>rows.find(r=>r.id===id)});
 rows.push(row(12),row(13));
 h.emit({eventType:'ticket_created',ticketId:12,eventId:'11111111-1111-4111-8111-111111111111',occurredAt:Date.now()/1000});
 h.emit({eventType:'ticket_created',ticketId:13,eventId:'22222222-2222-4222-8222-222222222222',occurredAt:(Date.now()-60000)/1000});
 await h.flush();assert.equal(h.states[3].source,'quiet');assert.deepEqual(h.states[3].moves,[]);h.cleanup();
});
test('an ambiguous local create stays quiet through unrelated targeted reads until full reconciliation',async()=>{
 let rows=[row(11)];const h=await ticketsHarness({list:async()=>rows,get:async id=>rows.find(r=>r.id===id),create:async()=>{rows.push(row(12));throw new Error('fixture lost create response');}});
 await h.actions.createTicket().completion;
 h.emit({eventType:'ticket_updated',ticketId:11,eventId:'11111111-1111-4111-8111-111111111111',occurredAt:Date.now()/1000});await h.flush();
 h.emit({eventType:'ticket_created',ticketId:12,eventId:'22222222-2222-4222-8222-222222222222',occurredAt:Date.now()/1000});await h.flush();
 assert.equal(h.states[3].source,'quiet');assert.deepEqual(h.states[3].moves,[]);
 h.emit({live:true});await settle();assert.equal(h.states[3].source,'quiet');
 rows.push(row(13));h.emit({live:true});await settle();assert.deepEqual(h.states[3].moves,[{id:13,from:null,to:'open'}]);h.cleanup();
});
