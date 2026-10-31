import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

function fixture() {
  const window = new EventTarget(), document = new EventTarget();
  document.visibilityState='visible';
  const navigator={onLine:true};
  let api=true, token='fixture', transport;
  window.WebSocket=class {};
  const mod={exports:{}};
  const code=ts.transpileModule(readFileSync(new URL('../src/api/realtime.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{module:mod,exports:mod.exports,window,document,navigator,URL,Event,CustomEvent,
    require:path=>path==='./notificationActivityStore'?{receiveNotificationActivity(){},resetActivityAccount(){},activityConnectionChanged(){}}:path==='./client'?{API_URL:'http://localhost:8765',getToken:()=>token,isApiAvailable:()=>api}:
      {REALTIME_SCOPES:['tickets','menu','shift','notices','analytics','users','session'],createRealtimeConnection:options=>{
        transport=options;return{start(){},stop(){options.health(false)}};
      }}});
  const stop=mod.exports.startRealtime();
  return {window,document,navigator,stop,poll:mod.exports.shouldPoll,ready:()=>transport.health(true),lost:()=>transport.health(false),
    api:value=>{api=value;window.dispatchEvent(new Event('barticket-api-status'));},token:value=>{token=value;window.dispatchEvent(new Event('barticket-auth'));}};
}

test('REST failure latches fallback despite unrelated success until next ready generation',()=>{
  const h=fixture();
  assert.equal(h.poll(),true);
  h.ready(); assert.equal(h.poll(),false);
  h.api(false); assert.equal(h.poll(),true);
  h.api(true); assert.equal(h.poll(),true);
  h.lost(); assert.equal(h.poll(),true);
  h.ready(); assert.equal(h.poll(),false);
  h.stop();assert.equal(h.poll(),true);
});
test('hidden/offline clients stop fallback reads and account changes reset healthy transport',()=>{
  const h=fixture();h.ready();
  h.token('second-fixture');assert.equal(h.poll(),true);
  h.document.visibilityState='hidden';assert.equal(h.poll(),false);
  h.document.visibilityState='visible';h.navigator.onLine=false;assert.equal(h.poll(),false);
  h.navigator.onLine=true;assert.equal(h.poll(),true);h.stop();
});

