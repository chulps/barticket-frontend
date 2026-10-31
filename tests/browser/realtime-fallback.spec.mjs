import {test,expect} from '@playwright/test';
const API='http://127.0.0.1:8765';
async function fixture(page, shared) {
  const sockets=[];let reads=0, posts=0, release;
  await page.clock.install();
  await page.addInitScript(()=>{localStorage.setItem('barticket_token','ISOLATED_REALTIME_FIXTURE');localStorage.setItem('barticket_locale','en');});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.routeWebSocket('**/realtime/ws',socket=>{sockets.push(socket);socket.onMessage(message=>{
    if(JSON.parse(message).type==='authenticate')socket.send(JSON.stringify({type:'ready',version:1,cursor:0}));
  });});
  await page.route(API+'/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
    let body={};
    if(path==='/auth/status')body={has_accounts:true};
    else if(path==='/auth/me')body={id:7,name:'Fixture Manager',email:'fixture@example.invalid',role:'manager',has_password:true};
    else if(path==='/menu')body={items:[],coverCharge:0};
    else if(path==='/shifts/current')body=null;
    else if(path==='/notices'){reads++;body={notices:shared.notices};}
    else if(path.endsWith('/restock')){posts++;await new Promise(resolve=>release=resolve);body={notices:[]};}
    else if(path==='/push/config')body={enabled:false};
    else return route.fulfill({status:404,json:{detail:'Unmocked fixture read'},headers:{'Access-Control-Allow-Origin':'*'}});
    return route.fulfill({json:body,headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.goto('/notifications');await expect(page.getByRole('heading',{name:'Notifications',exact:true})).toBeVisible();
  await expect.poll(()=>sockets.length).toBe(1);
  await page.clock.runFor(500);
  return{reads:()=>reads,posts:()=>posts,release:()=>release?.(),send:()=>sockets.at(-1).send(JSON.stringify({type:'invalidate',version:1,cursor:2,scopes:['notices']})),
    heartbeat:()=>sockets.at(-1).send(JSON.stringify({type:'heartbeat',version:1,cursor:2,scopes:[]}))};
}
const notice=name=>({id:1,menu_item_id:1,item:name,by:'Fixture Manager',at:1793448000});
test('two ready clients refresh events, suspend notices polling, resume after lost heartbeat',async({page,context})=>{
  const other=await context.newPage(),shared={notices:[notice('Original fixture stock')]};
  const a=await fixture(page,shared),b=await fixture(other,shared);
  shared.notices=[notice('Changed fixture stock')];a.send();b.send();
  for(const p of [page,other])await expect(p.getByText(/Changed fixture stock/)).toBeVisible();
  const before=a.reads();
  for(let i=0;i<5;i++){a.heartbeat();await page.clock.runFor(4000);}
  expect(a.reads()).toBe(before);
  shared.notices=[notice('Recovered fixture stock')];
  await page.clock.runFor(21_000);
  await expect(page.getByText(/Recovered fixture stock/)).toBeVisible();
  expect(a.reads()).toBeGreaterThan(before);expect(a.posts()+b.posts()).toBe(0);
});
test('notification invalidation during held restock reads once mutation settles without replaying write',async({page})=>{
  const shared={notices:[notice('Initial fixture stock')]},h=await fixture(page,shared);
  await page.getByRole('button',{name:'Mark in stock'}).click();
  await expect.poll(h.posts).toBe(1);
  shared.notices=[notice('Concurrent fixture stock')];h.send();
  await page.clock.runFor(500);h.release();
  await page.clock.runFor(500);
  await expect(page.getByText(/Concurrent fixture stock/)).toBeVisible();expect(h.posts()).toBe(1);
});
