import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';
function fixture(sharedStorage) {
  const events = new Map(), storage = sharedStorage ?? new Map(), played = [];
  const document = { visibilityState: 'visible', addEventListener: (k, v) => events.set(`document:${k}`, v) };
  let token = 'one', now = 100000;
  const context = { document, console, Infinity, Date: { now: () => now }, Event,
    getToken: () => token, localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    window: { dispatchEvent() {}, addEventListener: (k,v) => events.set(k,v) },
    navigator: { locks: { request: async (_name, fn) => fn() } },
    AudioContext: class { state='suspended'; currentTime=0; destination={}; async resume(){this.state='running'} async suspend(){this.state='suspended'}
      createOscillator(){ return {frequency:{value:0},connect(){},start(){played.push(1)},stop(){},disconnect(){}}; }
      createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    },
  };
  for (const file of ['notificationSoundPolicy','notificationSounds']) {
    let src = readFileSync(new URL(`../src/api/${file}.ts`,import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
    runInNewContext(ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  }
  context.installNotificationSounds();
  return {context, storage, played, events, document, setToken:v=>token=v, advance:v=>now+=v,
    emit(detail){events.get('barticket-push')({detail});}};
}
const event = (overrides={}) => ({eventId:'12345678-1234-1234-1234-123456789abc',occurredAt:101,eventType:'ticket_payment_recorded',soundCue:'ticket_paid',...overrides});
test('strict fresh transition validation excludes missing, stale, pre-unlock and unknown cues', () => {
  const f=fixture(), validate=f.context.freshSoundEvent;
  assert.ok(validate(event(),101000,100000));
  for(const value of [null,{},event({soundCue:'ticket_closed'}),event({eventType:'ticket_closed'}),event({eventType:'ticket_created'}),event({soundCue:'stock'}),event({eventId:'bad'}),event({occurredAt:NaN}),event({occurredAt:80}),event({occurredAt:110})]) assert.equal(validate(value,101000,100000),null);
  assert.equal(validate(event(),101000,102000),null);
});
test('off by default; preview does not opt in; user enable allows one deduplicated cue', async () => {
  const f=fixture();f.emit(event());assert.equal(f.played.length,0);
  await f.context.previewSound('ticket_created'); assert.equal(f.context.soundsEnabled(),false);
  assert.equal(f.played.length,2); await f.context.enableSounds();f.advance(1000);
  f.emit(event());assert.equal(f.played.length,5);f.emit(event());assert.equal(f.played.length,5);
});
test('hidden, logout, unknown/old events and missing cross-tab locks stay silent', async () => {
  const f=fixture();await f.context.enableSounds();f.advance(1000);
  f.document.visibilityState='hidden';f.emit(event());assert.equal(f.played.length,0);
  f.document.visibilityState='visible';f.context.navigator.locks=undefined;f.emit(event());assert.equal(f.played.length,0);
  f.events.get('barticket-auth')();assert.equal(f.context.soundsEnabled(),false);
  f.emit(event());assert.equal(f.played.length,0);
});
test('account changes while audio unlock awaits cannot arm previous account', async () => {
  const f=fixture();const operation=f.context.enableSounds();f.setToken('two');await assert.rejects(operation);assert.equal(f.context.soundsReady(),false);
});
test('visibility suspension requires explicit re-arm and ignores queued earlier events', async () => {
  const f=fixture();await f.context.enableSounds();f.advance(1000);
  f.document.visibilityState='hidden';f.events.get('document:visibilitychange')();
  f.document.visibilityState='visible';f.emit(event());assert.equal(f.played.length,0);
  f.advance(1000);await f.context.enableSounds();f.emit(event());assert.equal(f.played.length,0);
});
test('persisted dedupe bounds old ids and consumes bursts rather than queueing them',async()=>{
  const f=fixture();await f.context.enableSounds();f.advance(1000);f.emit(event());
  f.emit(event({eventId:'22345678-1234-1234-1234-123456789abc'}));assert.equal(f.played.length,3);
  f.advance(1000);f.emit(event({eventId:'22345678-1234-1234-1234-123456789abc'}));assert.equal(f.played.length,3);
  assert.deepEqual(JSON.parse(JSON.stringify(f.context.retainRecentSoundIds({'12345678-1234-1234-1234-123456789abc':1},100000))),{});
});
test('UI explicitly separates account push, device sounds, and background OS behavior',()=>{
  const ui=readFileSync(new URL('../src/components/NotificationPreferences.tsx',import.meta.url),'utf8');
  assert.match(ui,/across devices/); assert.match(ui,/role="switch"/); assert.match(ui,/lock-screen notification sounds/);
  assert.match(ui,/setPreferences\(null\)/);assert.match(ui,/getToken\(\) === token/);
  assert.match(ui,/Previews do not turn sounds on/);
});

test('shared persisted identity deduplicates across two active tabs', async () => {
  const storage = new Map(), first = fixture(storage), second = fixture(storage);
  await first.context.enableSounds(); await second.context.enableSounds();
  first.advance(1000); second.advance(1000);
  first.emit(event()); second.emit(event());
  assert.equal(first.played.length + second.played.length, 3);
});

test('automatic sounds report unsupported cross-tab coordination instead of silently enabling', async () => {
  const f=fixture(); f.context.navigator.locks=undefined;
  assert.equal(f.context.automaticSoundsSupported(),false);
  await assert.rejects(f.context.enableSounds());
  assert.equal(f.context.soundsEnabled(),false);
});
