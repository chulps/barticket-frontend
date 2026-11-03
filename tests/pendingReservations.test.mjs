import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingReservations, isCurrentReservationManager } from '../src/api/pendingReservations.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture() {
  let token = 'A'; const viewers = [], inboxes = [], states = [];
  const controller = createPendingReservations({ getToken: () => token, getViewer: () => { const d=deferred(); viewers.push(d); return d.promise; }, getInbox: () => { const d=deferred(); inboxes.push(d); return d.promise; }, publish: s => states.push(s) });
  return { controller, viewers, inboxes, states, token: v => { token=v; }, last: () => states.at(-1) };
}
test('manager count updates and request ordering prevents stale restores', async () => {
  const f=fixture(); const start=f.controller.authorize(); f.viewers[0].resolve({role:'manager'}); await flush();
  f.inboxes[0].resolve({pending_requests:[{},{}]}); await start; assert.equal(f.last().count,2);
  const a=f.controller.refresh(), b=f.controller.refresh();
  assert.equal(f.inboxes.length,2, 'bursts share one in-flight read');
  f.inboxes[1].resolve({pending_requests:[{}]}); await a; await b; await flush();
  assert.equal(f.last().count,2, 'invalidated snapshot is not published');
  assert.equal(f.inboxes.length,3, 'one follow-up read reconciles the burst');
  f.inboxes[2].resolve({pending_requests:[]}); await flush(); assert.equal(f.last().count,0);
});
test('role changes and auth epochs immediately retire old count and responses', async () => {
  const f=fixture(); const first=f.controller.authorize(); f.viewers[0].resolve({role:'manager'}); await flush();
  const second=f.controller.authorize(); assert.equal(f.last().count,null); f.viewers[1].resolve({role:'staff'}); await second;
  f.inboxes[0].resolve({pending_requests:[{}]}); await first; assert.equal(f.last().status,'staff');
  const third=f.controller.authorize(); f.token('B'); const fourth=f.controller.authorize();
  f.viewers[2].resolve({role:'manager'}); await third; f.viewers[3].resolve({role:'staff'}); await fourth;
  assert.equal(f.last().status,'staff'); assert.equal(f.last().token,'B'); assert.equal(f.inboxes.length,1);
});
test('failure is explicit and clears count; retry can recover', async () => {
  const f=fixture(); let p=f.controller.authorize(); f.viewers[0].resolve({role:'manager'}); await flush(); f.inboxes[0].reject(new Error('network')); await p;
  assert.equal(f.last().status,'error'); assert.equal(f.last().count,null);
  p=f.controller.authorize(); f.viewers[1].resolve({role:'manager'}); await flush(); f.inboxes[1].resolve({pending_requests:[{}]}); await p; assert.equal(f.last().count,1);
});
test('logout and stop suppress in-flight responses', async () => {
  const f=fixture(); const p=f.controller.authorize(); f.token(null); await f.controller.authorize(); f.viewers[0].resolve({role:'manager'}); await p;
  assert.equal(f.last().status,'anonymous'); assert.equal(f.inboxes.length,0);
  f.token('B'); const q=f.controller.authorize(); f.controller.stop(); f.viewers[1].resolve({role:'manager'}); await q; assert.equal(f.inboxes.length,0);
});
test('same-token reauthorization retires old failures and old role results', async () => {
  const f=fixture(); const first=f.controller.authorize(); const second=f.controller.authorize();
  f.viewers[1].resolve({role:'manager'}); await flush(); f.inboxes[0].resolve({pending_requests:[{}]}); await second;
  f.viewers[0].reject(new Error('old request')); await first; assert.equal(f.last().status,'ready'); assert.equal(f.last().count,1);
});
test('authorization synchronously clears the full manager inbox and stale reads cannot restore it', async () => {
  const f=fixture(); const first=f.controller.authorize(); f.viewers[0].resolve({role:'manager'}); await flush();
  const inbox={pending_requests:[{id:1}],notifications:[{id:7,reservation_id:1,is_read:false}]}; f.inboxes[0].resolve(inbox); await first;
  assert.equal(f.last().inbox,inbox);
  const pending=f.controller.refresh(); const auth=f.controller.authorize();
  assert.equal(f.last().status,'checking'); assert.equal(f.last().inbox,null);
  f.inboxes[1].resolve(inbox); await pending; assert.equal(f.last().inbox,null);
  f.viewers[1].resolve({role:'staff'}); await auth; assert.equal(f.last().status,'staff'); assert.equal(f.last().inbox,null);
});

test('same-token role recheck synchronously retires manager reads and actions', async () => {
  const f=fixture(); const first=f.controller.authorize(); f.viewers[0].resolve({role:'manager'}); await flush();
  f.inboxes[0].resolve({pending_requests:[{id:1}],notifications:[]}); await first;
  const oldEpoch=f.last().epoch;
  assert.equal(isCurrentReservationManager(f.last(), 'A', oldEpoch), true);
  const pending=f.controller.refresh(); const recheck=f.controller.authorize();
  assert.equal(isCurrentReservationManager(f.last(), 'A', oldEpoch), false);
  f.inboxes[1].resolve({pending_requests:[{id:1}],notifications:[]}); await pending;
  assert.equal(isCurrentReservationManager(f.last(), 'A', oldEpoch), false);
  f.viewers[1].resolve({role:'staff'}); await recheck;
  assert.equal(isCurrentReservationManager(f.last(), 'A', oldEpoch), false);
  assert.equal(f.last().inbox,null);
});

test('a denied inbox read immediately revokes manager access', async () => {
  const f=fixture(); const start=f.controller.authorize(); f.viewers[0].resolve({role:'manager'}); await flush();
  const epoch=f.last().epoch; f.inboxes[0].reject({status:403}); await start;
  assert.equal(f.last().status,'role-error'); assert.equal(isCurrentReservationManager(f.last(),'A',epoch),false);
});

test('private endpoint denial revokes existing rows immediately, but a stale denial cannot revoke a new epoch', async () => {
  const f=fixture(); let p=f.controller.authorize(); f.viewers[0].resolve({role:'manager'}); await flush();
  f.inboxes[0].resolve({pending_requests:[{id:1}],notifications:[]}); await p;
  const oldEpoch=f.last().epoch;
  assert.equal(f.controller.rejectAuthorization({status:403}, oldEpoch),true);
  assert.equal(f.last().inbox,null); assert.equal(isCurrentReservationManager(f.last(),'A',oldEpoch),false);
  await f.controller.authorize(); assert.equal(f.viewers.length,1, 'no automatic retry after denial');
  p=f.controller.authorize(true); f.viewers[1].resolve({role:'manager'}); await flush();
  f.inboxes[1].resolve({pending_requests:[{id:2}],notifications:[]}); await p;
  const newEpoch=f.last().epoch;
  assert.equal(f.controller.rejectAuthorization({status:401}, oldEpoch),false);
  assert.equal(isCurrentReservationManager(f.last(),'A',newEpoch),true);
  assert.equal(f.last().inbox.pending_requests[0].id,2);
});

test('role verification denial remains locked until explicit retry', async () => {
  const f=fixture(); const first=f.controller.authorize(); f.viewers[0].reject({status:403}); await first;
  assert.equal(f.last().status,'role-error'); await f.controller.authorize(); assert.equal(f.viewers.length,1);
  const retry=f.controller.authorize(true); f.viewers[1].resolve({role:'staff'}); await retry; assert.equal(f.last().status,'staff');
});
