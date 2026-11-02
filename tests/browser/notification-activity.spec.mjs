import {test,expect} from '@playwright/test';
const API='http://127.0.0.1:8765';
const event=(id,type='ticket_created',extra={})=>({id,type,at:1793480000+id,ticket_id:null,stock_notice_id:null,...extra});
async function fixture(page,state){
 const sockets=[],reads=[],writes=[],ticketReads=[];let cursor=0;
 await page.addInitScript(locale=>{localStorage.setItem('barticket_token','FEED_TEST');localStorage.setItem('barticket_locale',locale);},state.locale??'en');
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/release-history.json',route=>route.fulfill({json:{schema:1,releases:[]}}));
 await page.routeWebSocket('**/realtime/ws',socket=>{sockets.push(socket);socket.onMessage(msg=>{if(JSON.parse(msg).type==='authenticate'){expect(JSON.parse(msg).capabilities).toContain('activity');socket.send(JSON.stringify({type:'ready',version:1,cursor:0}));socket.send(JSON.stringify({type:'activity',version:1,cursor:0,shift_id:state.shiftId??4,reset:true,items:state.items,has_more:false}));}});});
 await page.route(API+'/**',async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(req.method()!=='GET')writes.push(path);
  if(req.method()==='GET'&&/^\/tickets\/\d+$/.test(path))ticketReads.push(path);
  let body={};
  if(path==='/auth/me')body={id:7,name:'Fixture',role:state.role??'staff'};
  else if(path==='/auth/status')body={has_accounts:true};
  else if(path==='/shifts/current')body=null;
  else if(path==='/menu')body={items:[]};
  else if(path==='/tickets')body=[];
  else if(path==='/tickets/158')body={id:158,name:'Haruka & friends',status:'paid',total:0,guest_count:0,cover_charge_total:0,cover_charge_per_person:0,items:[],payment:null,created_at:1,shift_id:4};
  else if(path==='/notices')body={notices:state.stock??[]};
  else if(path==='/push/config')body={enabled:false};
  else if(path==='/push/preferences')body={preferences:Object.fromEntries('ticket_created ticket_updated ticket_payment_recorded ticket_payment_deferred ticket_balance_written_off ticket_payment_corrected ticket_closed stock staff_drink shift_opened shift_closed shift_kept_open punch_corrected clock_in clock_out noon_clock_out'.split(' ').map(key=>[key,false]))};
  else if(path==='/notifications/activity'){
   reads.push(url.search);body={unexpected_activity_rest_request:true};
  }
  await route.fulfill({json:body,headers});
 });
 await page.goto('/notifications');await expect(page.getByRole('heading',{name:state.locale==='ja'?'現在の営業のアクティビティ':'Current shift activity'})).toBeVisible();await expect.poll(()=>sockets.length).toBe(1);
 return {reads,writes,ticketReads,send:(reset=false,shift_id=4)=>sockets.at(-1).send(JSON.stringify({type:'activity',version:1,cursor:++cursor,shift_id,reset,items:shift_id===null?[]:state.items,has_more:false})),disconnect:()=>sockets.at(-1).close()};
}
test('clocked-out push-disabled staff receive socket activity without REST and no duplicate stock rows',async({page})=>{
 const state={items:[event(1),event(2,'stock',{stock_notice_id:9})],stock:[{id:9,menu_item_id:3,item:'Gin',at:1793480002,by:'Fixture'}]};
 const h=await fixture(page,state),feed=page.getByRole('region',{name:'Current shift activity'});
 await expect(feed.getByText('New tickets',{exact:true})).toBeVisible();await expect(feed.getByText('Stock changes',{exact:true})).toHaveCount(0);
 state.items.push(event(3,'ticket_payment_recorded'));h.send();h.send();h.send();
 await expect(feed.getByText('Payments recorded',{exact:true})).toBeVisible();await expect(feed.locator('li')).toHaveCount(2);
 expect(h.reads).toEqual([]);expect(h.writes).toEqual([]);
 await expect(page.getByRole('switch',{name:'Use sounds on this device'})).toBeHidden();
 await expect(page.getByRole('button',{name:'Notification settings',exact:true})).toHaveAttribute('aria-expanded','false');
});
test('role reset and shift close clear old rows without history requests',async({page})=>{
 const state={role:'manager',items:[event(1,'ticket_payment_corrected')]};const h=await fixture(page,state),feed=page.getByRole('region',{name:'Current shift activity'});
 await expect(feed.getByText('Payment corrections',{exact:true})).toBeVisible();state.role='staff';state.items=[event(2,'clock_in')];h.send(true);
 await expect(feed.getByText('Payment corrections',{exact:true})).toHaveCount(0);await expect(feed.getByText('Staff clock-ins',{exact:true})).toBeVisible();
 h.send(true,null);await expect(feed.getByText('No shift is open.',{exact:true})).toBeVisible();await expect(feed.locator('li')).toHaveCount(0);expect(h.reads).toEqual([]);expect(h.writes).toEqual([]);
});
test('historical shift activity is requested only by explicit summon and older-page clicks',async({page})=>{
 const shift={id:30,business_date:'2025-11-02',status:'closed',opened_at:1700000000,closed_at:1700000100,opened_by:'Fixture',closed_by:'Fixture',paid_total:0,cash_total:0,card_total:0,other_total:0,cover_total:0,guest_count:0,paid_count:0,cancelled_count:0,staff_hours:[],staff_drinks:[],punches:[],stockouts:[]};
 const reads=[];
 await page.addInitScript(()=>{localStorage.setItem('barticket_token','HISTORY_TEST');localStorage.setItem('barticket_locale','en');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route(API+'/**',route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const values={'/auth/me':{id:7,name:'Fixture',role:'manager'},'/auth/status':{has_accounts:true},'/menu':{items:[]},'/analytics/shift-index':[shift],'/analytics/shifts':[shift],'/shifts/current':null,'/tickets':[],'/users':[],'/users/recipients':[],'/notices':{notices:[]},'/push/config':{enabled:false}};
  if(path==='/notifications/activity'){
   reads.push(url.searchParams.toString());const older=url.searchParams.has('before');
   return route.fulfill({json:{shift_id:30,items:[event(older?2:3,older?'clock_in':'shift_closed')],cursor:older?2:3,has_more:!older},headers});
  }
  return route.fulfill({json:Object.hasOwn(values,path)?values[path]:{},headers});
 });
 await page.goto('/analytics');const summon=page.getByRole('button',{name:'View notification history',exact:true});await expect(summon).toBeVisible();expect(reads).toEqual([]);
 await summon.click();const history=page.getByRole('region',{name:'Notification history'});await expect(history.getByText('Shift closed',{exact:false})).toBeVisible();expect(reads).toHaveLength(1);expect(reads[0]).toContain('shift_id=30');
 await history.getByRole('button',{name:'Older notifications'}).click();await expect(history.getByText('Staff clock-ins',{exact:false})).toBeVisible();expect(reads).toHaveLength(2);expect(reads[1]).toContain('before=3');await expect(history.locator('li')).toHaveCount(1);
});

for (const locale of ['en','ja']) for (const width of [320,390,768]) {
 test(`named activity is readable and keyboard accessible ${locale} ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  const longName=locale==='ja'?'札幌のお客様と仲間たち・とても長い伝票のお名前'.repeat(3):'A very long ticket name for friends visiting Sapporo '.repeat(3);
  const state={locale,items:[event(1,'clock_in'),event(2,'ticket_updated',{ticket_id:155,ticket_name:null}),event(3,'ticket_created',{ticket_id:156,ticket_name:'  '}),event(4,'ticket_updated',{ticket_id:157,ticket_name:longName}),event(5,'ticket_created',{ticket_id:158,ticket_name:'Haruka & friends'}),event(6,'ticket_updated',{ticket_id:159})]};
  const h=await fixture(page,state);
  const feed=page.getByRole('region',{name:locale==='ja'?'現在の営業のアクティビティ':'Current shift activity'});
  await expect(feed.getByRole('link',{name:/#158.*Haruka & friends/})).toBeVisible();
  await expect(feed.getByRole('link',{name:locale==='ja'?/#156.*名称未設定/:/#156.*Unnamed ticket/})).toBeVisible();
  await expect(feed.getByRole('link',{name:locale==='ja'?/#155.*名称を取得できません/:/#155.*Name unavailable/})).toBeVisible();
  await expect(feed.locator('li')).toHaveCount(6);
  await expect(feed.getByRole('link',{name:locale==='ja'?/#159.*名称を取得できません/:/#159.*Name unavailable/})).toBeVisible();
  const link=feed.getByRole('link').first();await link.focus();await expect(link).toBeFocused();
  expect(await link.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
  expect(await link.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await feed.getByRole('link').evaluateAll(els=>els.every(el=>el.scrollWidth<=el.clientWidth+1))).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`audit-activity-${locale}-${width}.png`),fullPage:true});
  expect(h.ticketReads).toEqual([]);
  await feed.getByRole('link',{name:/#158.*Haruka & friends/}).click();
  await expect(page).toHaveURL(/notifications\?ticket=158$/);
  await expect(page.getByRole('region',{name:locale==='ja'?'通知の伝票':'Linked ticket'})).toContainText(locale==='ja'?'確認専用':'Read-only');
  expect(h.ticketReads.length).toBeGreaterThan(0);
  expect(h.ticketReads.every(path=>path==='/tickets/158')).toBe(true);
  expect(h.reads).toEqual([]);expect(h.writes).toEqual([]);
 });
}
