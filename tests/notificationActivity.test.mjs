import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';import ts from 'typescript';
function module(name,imports={}){const m={exports:{}};runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/api/${name}.ts`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:p=>imports[p]});return m.exports;}
const policy=module('notificationActivity'),item=id=>({id,type:'ticket_created',at:1793480000,ticket_id:id,stock_notice_id:null}),empty={shiftId:null,items:[],received:false,connected:false};
const frame=(items,extra={})=>({type:'activity',version:1,cursor:1,shift_id:4,reset:true,items,has_more:false,...extra});
test('live snapshots and deltas are bounded, ordered and deduplicated',()=>{
 let state=policy.applyActivityFrame(empty,frame(Array.from({length:200},(_,i)=>item(i+1))));
 state=policy.applyActivityFrame(state,frame([item(200),item(201)],{reset:false,cursor:2}));assert.equal(state.items.length,200);assert.equal(state.items[0].id,2);assert.equal(state.items.at(-1).id,201);
 assert.equal(policy.applyActivityFrame(state,frame([item(3)],{reset:false,shift_id:5})),null);
 assert.equal(policy.applyActivityFrame(empty,frame([item(3)],{reset:false})),null);
});
test('shift close and role-filtered reset remove previous records; malformed snapshots fail closed',()=>{
 const populated=policy.applyActivityFrame(empty,frame([item(1)]));
 assert.equal(policy.applyActivityFrame(populated,frame([],{shift_id:null})).items.length,0);
 assert.equal(policy.applyActivityFrame(populated,frame([item(2)])).items[0].id,2);
 for(const bad of [frame([item(1)],{shift_id:null}),frame([],{reset:'yes'}),frame([{...item(1),at:Infinity}]),frame(Array.from({length:201},(_,i)=>item(i+1)))])assert.equal(policy.applyActivityFrame(empty,bad),null);
});
test('store clears cross-account data and rejects out-of-order frames',()=>{
 const store=module('notificationActivityStore',{'./notificationActivity':policy});
 store.receiveNotificationActivity(frame([item(1)],{cursor:10}),'one');
 store.receiveNotificationActivity(frame([],{shift_id:null,cursor:11}),'one');
 store.receiveNotificationActivity(frame([item(1)],{cursor:10}),'one');
 store.receiveNotificationActivity(frame([item(1)],{cursor:11}),'one');assert.equal(store.getActivitySnapshot().shiftId,null);
 store.resetActivityAccount('two');assert.equal(store.getActivitySnapshot().received,false);assert.equal(store.getActivitySnapshot().items.length,0);
 store.activityConnectionChanged(false);store.receiveNotificationActivity(frame([item(3)],{cursor:1}),'two');assert.equal(store.getActivitySnapshot().items[0].id,3);
});
test('normal feed never fetches or polls; explicit historical UI alone requests pages',()=>{
 for(const file of ['../src/hooks/useNotificationActivity.ts','../src/api/notificationActivityStore.ts','../src/components/NotificationActivity.tsx']){
 const source=readFileSync(new URL(file,import.meta.url),'utf8');assert.doesNotMatch(source,/apiRequest|fetch\(|setInterval|setTimeout|barticket-push|enablePush|clocked_in/);
 }
 const ui=readFileSync(new URL('../src/components/NotificationActivityHistory.tsx',import.meta.url),'utf8');assert.match(ui,/onClick=\{\(\)=>void load\(\)\}/);assert.doesNotMatch(ui,/setInterval|setTimeout/);
 const live=readFileSync(new URL('../src/components/NotificationActivity.tsx',import.meta.url),'utf8');assert.match(live,/activeStockIds.includes\(item.stock_notice_id\)/);assert.match(live,/Waiting for the live connection/);
});
test('history validates selected shift, newest-first rows and progressing cursor',async()=>{
 let result={shift_id:4,items:[item(3),item(2)],cursor:2,has_more:true};let requests=[];
 const history=module('notificationActivityHistory',{'./notificationActivity':policy,'./client':{apiRequest:async path=>{requests.push(path);return result;}}});
 await history.getActivityHistory(4);assert.equal(requests.length,1);assert.match(requests[0],/shift_id=4&limit=50$/);
 result={...result,shift_id:5};await assert.rejects(history.getActivityHistory(4));
 result={shift_id:4,items:[item(3)],cursor:3,has_more:false};await assert.rejects(history.getActivityHistory(4,3));
});

test('reconnect transport ready cannot bless retained rows before a negotiated reset',()=>{
 const store=module('notificationActivityStore',{'./notificationActivity':policy});
 store.receiveNotificationActivity(frame([item(1)],{cursor:10}),'one');assert.equal(store.getActivitySnapshot().connected,true);
 store.activityConnectionChanged(false);store.activityConnectionChanged(true);
 assert.equal(store.getActivitySnapshot().connected,false); // legacy server with no activity support
 store.receiveNotificationActivity(frame([item(2)],{cursor:11,reset:false}),'one');
 assert.equal(store.getActivitySnapshot().connected,false);assert.equal(store.getActivitySnapshot().items[0].id,1);
 store.receiveNotificationActivity(frame([],{shift_id:null,cursor:0}),'one');
 assert.equal(store.getActivitySnapshot().connected,true);assert.equal(store.getActivitySnapshot().items.length,0);
});
