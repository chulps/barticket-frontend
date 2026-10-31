import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {test} from 'node:test';
import ts from 'typescript';

function fixture() {
  const storage=new Map([['barticket_token','old']]), calls=[], events=[];
  let subscribed=true;
  const subscription={endpoint:'https://push.example.test/endpoint',toJSON:()=>({endpoint:'https://push.example.test/endpoint',keys:{auth:'test',p256dh:'test'}}),unsubscribe:async()=>{calls.push('unsubscribe');subscribed=false;return true;}};
  const registration={pushManager:{getSubscription:async()=>subscribed?subscription:null,subscribe:async()=>{calls.push('subscribe');subscribed=true;return subscription;}}};
  const context={console:{warn(){}},URL,Event,AbortController,Promise,Uint8Array,ArrayBuffer,atob,crypto:{randomUUID:()=> 'test-device'},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    navigator:{serviceWorker:{getRegistration:async()=>registration,register:async()=>registration}},
    Notification:{permission:'granted',requestPermission:async()=> 'granted'},
    window:{setTimeout,clearTimeout,PushManager:{},Notification:{},dispatchEvent:e=>events.push(e.type)},
    fetch:async(url,options)=>{calls.push({url,options});return {ok:true,status:200,json:async()=>url.endsWith('/vapid-public-key')?{public_key:'dGVzdA'}:{enabled:true}}}};
  for(const file of ['pushLifecycle','client','push']) {
    let source=readFileSync(new URL(`../src/api/${file}.ts`,import.meta.url),'utf8')
      .replace(/^import .*;\n/gm,'').replaceAll('import.meta.env.VITE_API_URL','"https://api.example.test"')
      .replaceAll('import.meta.env.BASE_URL','"/bar/"').replaceAll('import.meta.env.PROD','false')
      .replace(/export /g,'');
    source=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(source,context);
  }
  return {context,calls,events,subscription,get subscribed(){return subscribed}};
}

test('signout unsubscribes browser even when revoked server cleanup fails',async()=>{
  const f=fixture();f.context.fetch=async()=>{f.calls.push('server failed');throw Error('offline');};
  f.context.setToken(null);
  await f.context.serializePushOperation(async()=>{});
  assert.equal(f.subscribed,false);
  assert.deepEqual(f.calls,['unsubscribe','server failed']);
  assert.equal(f.context.getToken(),null);
});

test('enabled status checks server ownership and never trusts a browser subscription alone',async()=>{
  const f=fixture();f.context.fetch=async(url,options)=>{f.calls.push({url,options});return {ok:true,json:async()=>({enabled:false})};};
  assert.equal(await f.context.getPushEnabled(),false);
  assert.equal(f.calls[0].url,'https://api.example.test/push/subscriptions/status');
  assert.equal(f.calls[0].options.headers.Authorization,'Bearer old');
  assert.equal(JSON.parse(f.calls[0].options.body).endpoint,f.subscription.endpoint);
});

test('late ownership response cannot enable notifications after account switch',async()=>{
  const f=fixture();let resolve,started;
  const ready=new Promise(r=>started=r);
  f.context.fetch=async()=>{started();return new Promise(r=>resolve=r);};
  const checking=f.context.getPushEnabled();
  await ready;f.context.setToken('new');
  resolve({ok:true,json:async()=>({enabled:true})});
  await assert.rejects(checking,/session changed/);
  // Allow queued best-effort DELETE to finish.
  f.context.fetch=async()=>({ok:true,json:async()=>({})});
  await f.context.serializePushOperation(async()=>{});
  assert.equal(f.subscribed,false);
});

test('new opt-in waits for old cleanup and uses only the new bearer',async()=>{
  const f=fixture();let release,started;
  const ready=new Promise(r=>started=r);
  f.context.fetch=async(url,options)=>{
    f.calls.push({url,options});
    if(options.method==='DELETE'){started();await new Promise(r=>release=r);}
    return {ok:true,json:async()=>url.endsWith('vapid-public-key')?{public_key:'dGVzdA'}:{enabled:true}};
  };
  f.context.setToken('new');await ready;
  const enabled=f.context.enablePush();
  await new Promise(r=>setTimeout(r,0));
  assert.equal(f.calls.includes('subscribe'),false);
  release();await enabled;
  const posts=f.calls.filter(c=>c.options?.method==='POST');
  assert.equal(posts.length,1);assert.equal(posts[0].options.headers.Authorization,'Bearer new');
  assert.ok(f.calls.indexOf('unsubscribe')<f.calls.indexOf('subscribe'));
});

test('account change while permission is pending cannot register a new subscription',async()=>{
  const f=fixture();let allow,started;const ready=new Promise(r=>started=r);
  f.context.Notification.requestPermission=async()=>{started();return new Promise(r=>allow=r);};
  const enabling=f.context.enablePush();await ready;
  f.context.setToken('new');allow('granted');
  await assert.rejects(enabling,/session changed/);
  await f.context.serializePushOperation(async()=>{});
  assert.equal(f.calls.some(c=>c.options?.method==='POST'),false);
  assert.equal(f.subscribed,false);
});

test('account change while status JSON is decoding rejects stale enabled result',async()=>{
  const f=fixture();let decode,started;const ready=new Promise(r=>started=r);
  f.context.fetch=async()=>({ok:true,json:async()=>{started();return new Promise(r=>decode=r);}});
  const checking=f.context.getPushEnabled();await ready;f.context.setToken('new');
  decode({enabled:true});await assert.rejects(checking,/session changed/);
  f.context.fetch=async()=>({ok:true,json:async()=>({})});
  await f.context.serializePushOperation(async()=>{});
});

test('stalled status times out so queued account cleanup can unsubscribe',async()=>{
  const f=fixture();let timeout,started;const ready=new Promise(r=>started=r);
  f.context.window.setTimeout=fn=>{timeout=fn;return 1;};f.context.window.clearTimeout=()=>{};
  f.context.fetch=async(url,{signal})=>{
    if(url.endsWith('/status')){started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));}
    return {ok:true,json:async()=>({})};
  };
  const checking=f.context.getPushEnabled();await ready;f.context.setToken('new');
  timeout();await assert.rejects(checking,/timeout/);
  await f.context.serializePushOperation(async()=>{});
  assert.equal(f.subscribed,false);
});

test('stalled old-server cleanup times out without blocking subsequent new-account status',async()=>{
  const f=fixture();let timeout,started;const ready=new Promise(r=>started=r);
  f.context.window.setTimeout=fn=>{timeout=fn;return 1;};f.context.window.clearTimeout=()=>{};
  f.context.fetch=async(url,{signal,method})=>{
    if(method==='DELETE'){started();return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))));}
    return {ok:true,json:async()=>({enabled:false})};
  };
  f.context.setToken('new');await ready;
  const checking=f.context.getPushEnabled();timeout();
  assert.equal(await checking,false);
  assert.equal(f.subscribed,false);
});

test('explicit opt-in replaces a stale local subscription rather than claiming another account endpoint',async()=>{
  const f=fixture();f.context.fetch=async(url,options)=>{
    f.calls.push({url,options});
    return {ok:true,json:async()=>url.endsWith('vapid-public-key')?{public_key:'dGVzdA'}:{enabled:!url.endsWith('/status')}};
  };
  await f.context.enablePush();
  assert.ok(f.calls.indexOf('unsubscribe')<f.calls.indexOf('subscribe'));
  assert.equal(f.calls.filter(c=>c.options?.method==='DELETE').length,0);
  assert.equal(f.calls.filter(c=>c.url?.endsWith('/subscriptions')).length,1);
});
