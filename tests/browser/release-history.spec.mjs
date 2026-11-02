import { test, expect } from '@playwright/test';
const releases=Array.from({length:12},(_,i)=>({id:`${100-i}:1`,sha:(i%2?'a':'b').repeat(40),builtAt:`2026-11-${String(12-i).padStart(2,'0')}T13:00:00Z`}));
async function fixture(page, locale='en') {
 await page.addInitScript(locale=>{localStorage.setItem('barticket_token','TEST_ONLY');localStorage.setItem('barticket_locale',locale);},locale);
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('http://127.0.0.1:8765/**',r=>{
  const path=new URL(r.request().url()).pathname;
  let body={};if(path==='/auth/me')body={id:7,name:'Fixture',role:'staff'};else if(path==='/notices')body={notices:[]};else if(path==='/shifts/current')body=null;else if(path==='/tickets')body=[];else if(path==='/menu')body={items:[]};
  return r.fulfill({json:body,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
 });
 await page.route('**/release-history.json',r=>r.fulfill({json:{schema:1,releases}}));
}
for(const locale of ['en','ja'])for(const width of [320,390,768])test(`release history ${locale} at ${width} is legible, persistent and paged`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await fixture(page,locale);await page.goto('/notifications');
 const section=page.getByRole('region',{name:locale==='ja'?'アプリの更新履歴':'App updates'});
 await expect(section.getByRole('listitem')).toHaveCount(5);
 await expect(section).toContainText('JST');await expect(section).toContainText('bbbbbbb');
 await expect(section).toContainText(locale==='ja'?'シフト終了後も残ります':'kept after each shift ends');
 expect(await section.locator('p').last().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await section.getByRole('button',{name:locale==='ja'?'以前の更新を表示':'Show older updates'}).click();await expect(section.getByRole('listitem')).toHaveCount(12);
 await page.screenshot({path:testInfo.outputPath(`audit-release-history-${locale}-${width}.png`),fullPage:true});
 await page.reload();await expect(section.getByRole('listitem')).toHaveCount(5);
});
test('missing history is an error with retry, not an empty success; refresh failure retains records',async({page})=>{
 await fixture(page);let fail=true;
 await page.route('**/release-history.json',r=>fail?r.fulfill({status:404,body:'missing'}):r.fulfill({json:{schema:1,releases:[releases[0],releases[0]]}}));
 await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});
 await expect(section).toContainText('Could not refresh app updates');await expect(section.getByRole('listitem')).toHaveCount(0);
 fail=false;await section.getByRole('button',{name:'Retry',exact:true}).click();await expect(section.getByRole('listitem')).toHaveCount(1);
 fail=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(section).toContainText('Showing the last loaded records');await expect(section.getByRole('listitem')).toHaveCount(1);
});
test('empty history and published newer release are honest; no business write or sound is emitted',async({page})=>{
 await fixture(page);let data=[];const writes=[];
 page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method()))writes.push(r.url());});
 await page.route('**/release-history.json',r=>r.fulfill({json:{schema:1,releases:data}}));
 await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});await expect(section).toContainText('No app updates recorded yet');
 data=[releases[0]];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(section.getByRole('listitem')).toHaveCount(1);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(section.getByRole('listitem')).toHaveCount(1);expect(writes).toEqual([]);
});
