import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
async function load(name) {
 const s=readFileSync(new URL('../src/hooks/'+name+'.ts',import.meta.url),'utf8');
 return import('data:text/javascript,'+encodeURIComponent(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText));
}
const {ticketListPath,analyticsTicketScope}=await load('ticketReadScope');
const {ticketInvalidationId,mergeTicketDelta}=await load('ticketDelta');
test('POS scope retains all open tickets and only requested night history; legacy remains explicit',()=>{
 assert.equal(ticketListPath(),'/tickets');
 assert.equal(ticketListPath({include_open:true}),'/tickets?include_open=true');
 assert.equal(ticketListPath({include_open:true,shift_id:5}),'/tickets?shift_id=5&include_open=true');
});
test('Analytics scopes day month leap year and year; all-time only on explicit all',()=>{
 assert.deepEqual(analyticsTicketScope('day','2026-10-31'),{date_from:'2026-10-31',date_to:'2026-10-31'});
 assert.deepEqual(analyticsTicketScope('month','2024-02'),{date_from:'2024-02-01',date_to:'2024-02-29'});
 assert.deepEqual(analyticsTicketScope('month','2026-02'),{date_from:'2026-02-01',date_to:'2026-02-28'});
 assert.deepEqual(analyticsTicketScope('year','2024'),{date_from:'2024-01-01',date_to:'2024-12-31'});
 assert.equal(analyticsTicketScope('all','all'),undefined);
});
test('only supported positive safe ID hints narrow reads; unknown/gap/reconnect hints fall back',()=>{
 for(const eventType of ['ticket_created','ticket_updated','ticket_paid','ticket_cancelled','ticket_reopened'])assert.equal(ticketInvalidationId({eventType,ticketId:17}),17);
 for(const hint of [null,{}, {eventType:'gap',ticketId:17},{eventType:'ticket_updated',ticketId:'17'},{eventType:'ticket_updated',ticketId:-1},{eventType:'ticket_updated',ticketId:1.5}])assert.equal(ticketInvalidationId(hint),null);
});
test('targeted refresh replaces duplicates and removes deleted or transferred-out closed tickets',()=>{
 const old=[{id:1,status:'open',shiftId:1},{id:2,status:'paid',shiftId:3},{id:3,status:'cancelled',shiftId:3}];
 const moved={id:2,status:'paid',shiftId:4};
 assert.deepEqual(mergeTicketDelta(old,[2,3],[moved],3),[old[0]]);
 const reopened={id:2,status:'open',shiftId:4};
 const once=mergeTicketDelta(old,[2],[reopened],3);
 assert.equal(once.filter(t=>t.id===2).length,1);
 assert.deepEqual(mergeTicketDelta(once,[2],[reopened],3),once);
 const paid={id:1,status:'paid',shiftId:3};
 assert.equal(mergeTicketDelta(old,[1],[paid],3).find(t=>t.id===1).status,'paid');
});
test('scoped snapshots and delta reads retain optimistic revision and auth guards',()=>{
 const s=readFileSync(new URL('../src/hooks/useTickets.ts',import.meta.url),'utf8');
 assert.match(s,/acceptBackgroundSnapshot\(snapshot/);assert.match(s,/token !== getToken\(\)/);
 assert.match(s,/pendingWrites.current > 0/);assert.match(s,/pendingIds.size > 50/);
 assert.match(s,/error.status === 404/);assert.match(s,/pendingFull = true; retryRead\(\)/);
 assert.match(s,/"barticket-auth", onFocus/);
});

test('delta scope retains cross-night collections including voided audit payments',()=>{
 const collected={id:9,status:'paid',shiftId:1,payments:[{collection_shift_id:3,voided_at:100}]};
 assert.deepEqual(mergeTicketDelta([], [9], [collected],3),[collected]);
 const moved={...collected,payments:[{collection_shift_id:4}]};
 assert.deepEqual(mergeTicketDelta([collected],[9],[moved],3),[]);
});
