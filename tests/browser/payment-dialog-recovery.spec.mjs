import {test, expect} from '@playwright/test';
const API='http://127.0.0.1:8765';
async function fixture(page,locale='en',balance=700,width=390) {
 await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
 await page.setViewportSize({width,height:844});
 await page.addInitScript(locale=>{localStorage.setItem('barticket_token','fixture-only');localStorage.setItem('barticket_locale',locale);},locale);
 const ticket={id:11,name:'Recovery fixture',status:'open',service_status:'completed',service_business_date:'2026-10-31',settlement_status:'outstanding',deferred_at:1793440000,unpaid_reason:'pay_later',items:[],guest_count:0,cover_charge_per_person:0,cover_charge_total:0,total:700,balance_due:balance,amount_paid:700-balance,payments:[],created_at:1793440000,paid_at:null,cancelled_at:null,created_by:'Fixture manager',shift_id:3,payment:null};
 const state={ticket,posts:[],fail:false,hold:null};
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route(API+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(path==='/tickets/11/pay'&&req.method()==='POST'){
   const body=req.postDataJSON();state.posts.push({body,key:req.headers()['idempotency-key']});
   if(state.hold)await state.hold;
   if(state.fail)return route.fulfill({status:typeof state.fail==='number'?state.fail:503,json:{detail:'Fixture uncertain response'},headers});
   ticket.balance_due-=body.amount;ticket.amount_paid+=body.amount;
   ticket.settlement_status=ticket.balance_due===0?'settled':'partially_paid';
   ticket.status=ticket.balance_due===0?'paid':'open';
   ticket.payment={type:body.method,amount:body.amount,paid_at:1793440000};
   return route.fulfill({json:ticket,headers});
  }
  const values={'/auth/me':{id:7,name:'Fixture manager',role:'manager'},'/auth/status':{has_accounts:true},'/menu':{items:[]},'/tickets/receivables':{items:[ticket],total:1,offset:0,limit:50},'/shifts/current':null,'/tickets':[ticket],'/users/recipients':[],'/notices':{notices:[]}};
  return route.fulfill({json:values[path]??{},headers});
 });
 await page.goto('/receivables');
 return state;
}
const open=async(page,ja=false)=>{await page.getByRole('button',{name:ja?'支払いを記録':'Record payment',exact:true}).click();return page.getByRole('dialog');};
for(const width of [390,1280]) for(const locale of ['en','ja']){
 const ja=locale==='ja';
 for(const [balance,amount,remaining] of [[700,300,400],[400,400,0],[500,200,300]])test(`authoritative partial receipt ${balance}/${amount}: ${locale} ${width}px`,async({page},testInfo)=>{
  const state=await fixture(page,locale,balance,width);const dialog=await open(page,ja);
  await dialog.getByRole('spinbutton').fill(String(amount));
  await dialog.locator('button').last().click();
  await expect(dialog.getByRole('heading',{name:ja?'入金を記録しました':'Payment recorded'})).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText(`¥${remaining}`);
  await page.screenshot({path:testInfo.outputPath(`audit-payment-receipt-${locale}-${width}-${balance}-${amount}.png`)});
  await expect(dialog.getByText(ja?'全額お支払い済み':'Fully settled',{exact:true})).toHaveCount(remaining===0?1:0);
  expect(state.posts).toHaveLength(1);expect(state.posts[0].body.amount).toBe(amount);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(`pending X/Escape/backdrop stay open; uncertain close/reopen keeps exact retry: ${locale} ${width}px`,async({page},testInfo)=>{
  const state=await fixture(page,locale,700,width);let release;state.hold=new Promise(resolve=>{release=resolve;});state.fail=true;
  let dialog=await open(page,ja);await dialog.getByRole('spinbutton').fill('300');
  await dialog.locator('button').last().click();await expect.poll(()=>state.posts.length).toBe(1);
  await dialog.locator('button').first().click();await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  await dialog.locator('..').click({position:{x:1,y:1}});await expect(dialog).toBeVisible();
  expect(state.posts).toHaveLength(1);release();state.hold=null;
  await expect(dialog.getByRole('alert')).toBeVisible();
  await page.screenshot({path:testInfo.outputPath(`audit-payment-uncertain-${locale}-${width}.png`)});
  page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
  page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:ja?'閉じて伝票を確認':'Close and check ticket',exact:true}).click();await expect(dialog).toHaveCount(0);
  dialog=await open(page,ja);await expect(dialog.getByRole('spinbutton')).toHaveValue('300');await expect(dialog.getByRole('spinbutton')).toBeDisabled();
  state.fail=false;await dialog.locator('button').last().click();await expect(dialog.getByRole('status')).toContainText('¥400');
  expect(state.posts).toHaveLength(2);expect(state.posts[1]).toEqual(state.posts[0]);
 });
}
test('auth teardown removes pending modal and prevents stale success from appearing',async({page})=>{
 const state=await fixture(page);let release;state.hold=new Promise(resolve=>{release=resolve;});
 const dialog=await open(page);await dialog.locator('button').last().click();await expect.poll(()=>state.posts.length).toBe(1);
 await page.evaluate(()=>window.dispatchEvent(new Event('barticket-auth')));await expect(dialog).toHaveCount(0);release();
 await expect(page.getByRole('heading',{name:'Payment recorded'})).toHaveCount(0);
});


test('first validation rejection unlocks correction; error after uncertain response retains same intent',async({page})=>{
 const state=await fixture(page);let dialog=await open(page);
 await dialog.getByRole('spinbutton').fill('300');state.fail=400;
 await dialog.locator('button').last().click();
 await expect(dialog.getByRole('alert')).toContainText('Payment was not recorded');
 await expect(dialog.getByRole('spinbutton')).toBeEnabled();
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 dialog=await open(page);await dialog.getByRole('spinbutton').fill('200');state.fail=503;
 await dialog.locator('button').last().click();await expect(dialog.getByRole('alert')).toContainText('unconfirmed');
 state.fail=400;await dialog.locator('button').last().click();await expect(dialog.getByRole('alert')).toContainText('unconfirmed');
 await expect(dialog.getByRole('spinbutton')).toBeDisabled();
 expect(state.posts[1]).toEqual(state.posts[2]);expect(state.posts[0].key).not.toBe(state.posts[1].key);
});
