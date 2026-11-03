import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
const code=readFileSync(new URL('../src/pages/reservationLinkClaim.js',import.meta.url),'utf8').replaceAll('export function','function');
const scope={}; runInNewContext(code,scope); const claim=scope.claimReservationLink;
test('a canceled in-flight effect releases its link so the next effect retries',()=>{
  const ref={current:null}; const cancel=claim(ref,'session:23');
  assert.equal(typeof cancel,'function'); assert.equal(claim(ref,'session:23'),null);
  cancel(); const retry=claim(ref,'session:23'); assert.equal(typeof retry,'function');
  assert.equal(claim(ref,'session:23'),null); retry(); assert.equal(ref.current,null);
});
test('stale cleanup cannot clear a newer account or link claim',()=>{
  const ref={current:null}; const old=claim(ref,'accountA:23'); const next=claim(ref,'accountB:23');
  old(); assert.equal(ref.current.key,'accountB:23'); assert.equal(claim(ref,'accountB:23'),null);
  next(); assert.equal(ref.current,null);
});

test('permission and not-found failures are final; connection and server failures offer retry',()=>{
  assert.equal(scope.reservationLinkFailure({status:403}),'unavailable');
  assert.equal(scope.reservationLinkFailure({status:404}),'unavailable');
  assert.equal(scope.reservationLinkFailure({status:503}),'retry');
  assert.equal(scope.reservationLinkFailure(new Error('offline')),'retry');
});

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
test('transient failure settles once and retries only on a new attempt', async()=>{
  const first=deferred(), second=deferred(), events=[];
  const start=(request)=>scope.runReservationLinkFlight({read:()=>request.promise,isCurrent:()=>true,onLoaded:item=>events.push(item),onFailure:()=>events.push('retry'),onSettled:()=>events.push('settled')});
  start(first); first.reject(new Error('offline')); await tick(); assert.deepEqual(events,['retry','settled']);
  await tick(); assert.deepEqual(events,['retry','settled']);
  start(second); second.resolve('loaded'); await tick(); assert.deepEqual(events,['retry','settled','loaded','settled']);
});
test('an older retired effect resolving after the new flight cannot alter it', async()=>{
  const old=deferred(), next=deferred(), events=[];
  const start=request=>scope.runReservationLinkFlight({read:()=>request.promise,isCurrent:()=>true,onLoaded:item=>events.push(item),onFailure:()=>events.push('error'),onSettled:()=>events.push('settled')});
  const cancel=start(old); cancel(); start(next); next.resolve('new'); await tick(); old.resolve('old'); await tick();
  assert.deepEqual(events,['new','settled']);
});
