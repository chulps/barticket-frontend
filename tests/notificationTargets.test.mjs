import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {test} from "node:test";
const source=readFileSync(new URL("../public/sw.js",import.meta.url),"utf8");
function worker(scope="https://example.test/barticket-frontend/",clients=[]) {
  const handlers={},shown=[],opened=[];
  const self={registration:{scope,showNotification:async(title,options)=>shown.push({title,...options})},location:{origin:new URL(scope).origin},clients:{matchAll:async()=>clients,openWindow:async url=>opened.push(url)},addEventListener:(name,fn)=>handlers[name]=fn};
  runInNewContext(source,{self,URL,Number,Promise});
  async function push(payload){let pending;handlers.push({data:{json:()=>payload},waitUntil:p=>pending=p});await pending;return shown.at(-1);}
  async function click(url){let pending;handlers.notificationclick({notification:{data:{url},close(){}},waitUntil:p=>pending=p});await pending;}
  return {push,click,opened};
}
test("ticket push destinations preserve entity ID and deployment base",async()=>{
  for(const base of ["https://example.test/","https://example.test/barticket-frontend/"]){
    const w=worker(base);
    const n=await w.push({type:"ticket_payment_recorded",ticket_id:42});
    const url=new URL(n.data.url);
    assert.equal(url.pathname,new URL("notifications",base).pathname);
    assert.equal(url.searchParams.get("ticket"),"42");
    assert.equal(url.searchParams.get("from_push"),"1");
  }
});
test("unknown types, stock, missing IDs and invalid URLs fall back to Notifications",async()=>{
  const w=worker();
  for(const payload of [{type:"unknown",ticket_id:42},{type:"stock",ticket_id:42},{type:"ticket_updated"},{type:"ticket_updated",ticket_id:-1}]){
    const n=await w.push(payload);assert.equal(new URL(n.data.url).searchParams.has("ticket"),false);
  }
  for(const url of ["javascript:alert(1)","https://evil.test/notifications?ticket=3","https://example.test/barticket-frontend/tickets","bad-url"]){
    await w.click(url);assert.equal(w.opened.at(-1),"https://example.test/barticket-frontend/notifications?from_push=1");
  }
});
test("warm clicks never navigate a window with different work; exact destination can focus",async()=>{
  let navigated=0,focused=0;
  const target="https://example.test/barticket-frontend/notifications?from_push=1&ticket=42";
  const client={url:"https://example.test/barticket-frontend/tickets",navigate:()=>navigated++,focus:()=>focused++,postMessage(){}};
  const w=worker(undefined,[client]);
  await w.click(target);assert.equal(navigated,0);assert.deepEqual(w.opened,[target]);
  client.url=target;await w.click(target);assert.equal(focused,1);assert.equal(w.opened.length,1);
});
