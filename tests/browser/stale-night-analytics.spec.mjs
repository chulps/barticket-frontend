import { test, expect } from '@playwright/test';

const shift = (id,date,status='closed') => ({id,business_date:date,status,opened_at:1700000000,closed_at:1700000100,
 opened_by:'Fixture manager',closed_by:'Fixture manager',paid_total:1000,cash_total:1000,card_total:0,other_total:0,
 cover_total:0,guest_count:1,paid_count:1,cancelled_count:0,staff_hours:[],staff_drinks:[],punches:[],stockouts:[]});

for (const locale of ['en','ja']) test(`stale night leaves history readable and current-night jump explicit: ${locale}`,async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.addInitScript(locale=>{localStorage.setItem('barticket_token','fixture-only');localStorage.setItem('barticket_locale',locale);},locale);
 let stale=true;const writes=[];const ticketReads=[];
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route('http://127.0.0.1:8765/**',route=>{
  const request=route.request(),path=new URL(request.url()).pathname;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'};
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(request.method()!=='GET')writes.push(path);
  if(path==='/tickets')ticketReads.push(new URL(request.url()).searchParams.toString());
  if(path==='/shifts/current'&&stale)return route.fulfill({status:409,json:{detail:{code:'STALE_OPEN_SHIFT',shift_id:514,business_date:'2026-10-30'}},headers});
  const values={'/auth/me':{id:7,name:'Fixture manager',role:'manager'},'/auth/status':{has_accounts:true},
   '/menu':{items:[]},'/analytics/shift-index':[shift(30,'2025-11-02')],'/shifts/current':shift(515,'2026-10-31','open'),'/analytics/shifts':[shift(30,'2025-11-02')],
   '/tickets':[],'/users':[],'/users/recipients':[],'/notices':{notices:[]},'/push/status':{enabled:false},'/realtime/events':{cursor:0,scopes:[]}};
  return route.fulfill({json:values[path]??{},headers});
 });
 await page.goto('/analytics');
 await expect(page.getByRole('link',{name:locale==='ja'?'シフトを確認する':'Review shift'})).toBeVisible();
 const calendar=page.locator('button[aria-expanded]').filter({hasText:'2025'});
 await expect(calendar).toBeVisible();
 stale=false;
 await page.evaluate(()=>window.dispatchEvent(new Event('barticket-analytics-updated')));
 const jump=page.getByRole('button',{name:locale==='ja'?'現在の営業日 · 2026-10-31':'Current night · 2026-10-31',exact:true});
 await expect(jump).toBeVisible();
 // A refresh never silently replaces the historical day being inspected.
 await expect(calendar).toBeVisible();
 await jump.click();
 await expect(page.locator('button[aria-expanded]').filter({hasText:'2026'})).toBeVisible();
 await expect(page.getByRole('link',{name:locale==='ja'?'シフトを確認する':'Review shift'})).toHaveCount(0);
 expect(writes).toEqual([]);
 expect(ticketReads.length).toBeGreaterThan(0);
 expect(ticketReads.every(query=>query.includes('date_from=')&&query.includes('date_to='))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
