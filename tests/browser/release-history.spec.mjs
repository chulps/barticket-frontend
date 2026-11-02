import { test, expect } from '@playwright/test';
const shippedCommits=[
 'd48c8f9894502486d99b64ba9145893520a8adc9',
 '532b62443f541d3fa7e3e07a1ef5194bb22f8926',
 '49af03e855fbafdf780913ae4fd4b25420725994',
];
const unknownPrefixCollision='d48c8f9'+'0'.repeat(33);
const releases=Array.from({length:12},(_,i)=>({id:`${100-i}:1`,sha:shippedCommits[i]??(i===3?unknownPrefixCollision:(i%2?'a':'b').repeat(40)),builtAt:`2026-11-${String(12-i).padStart(2,'0')}T13:00:00Z`}));
async function fixture(page, locale='en', accountId=7) {
 await page.addInitScript(({locale,accountId})=>{localStorage.setItem('barticket_token',`TEST_ONLY_${accountId}`);localStorage.setItem('barticket_locale',locale);}, {locale,accountId});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('http://127.0.0.1:8765/**',r=>{
  const path=new URL(r.request().url()).pathname;
  const token=(r.request().headers().authorization??'').replace(/^Bearer\s+/,'');
  const tokenAccount=Number(token.match(/_(\d+)$/)?.[1]);
  let body={};if(path==='/auth/me')body={id:Number.isSafeInteger(tokenAccount)&&tokenAccount>0?tokenAccount:accountId,name:'Fixture',role:'staff'};else if(path==='/notices')body={notices:[]};else if(path==='/shifts/current')body=null;else if(path==='/tickets')body=[];else if(path==='/menu')body={items:[]};
  return r.fulfill({json:body,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'}});
 });
 await page.route('**/release-history.json',r=>r.fulfill({json:{schema:1,releases}}));
}
for(const locale of ['en','ja'])for(const width of [320,390,768])test(`release history ${locale} at ${width} is legible, persistent and paged`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});await fixture(page,locale);await page.goto('/notifications');
 const section=page.getByRole('region',{name:locale==='ja'?'アプリの更新履歴':'App updates'});
 await expect(section.locator('ol > li')).toHaveCount(5);
 await expect(section.getByRole('group',{name:locale==='ja'?'アプリ更新の管理':'Manage app updates'})).toBeVisible();
 await expect(section).toContainText('JST');await expect(section).toContainText('d48c8f9');
 await expect(section).toContainText(locale==='ja'?'スケジュールカレンダーとチケット更新':'Schedule calendar and ticket updates');
 await expect(section).toContainText(locale==='ja'?'月表示または予定一覧で':'Plan and edit schedules in a month or agenda calendar.');
 await expect(section).toContainText(locale==='ja'?'シフト終了後も残ります':'kept after each shift ends');
 const entries=section.locator('ol > li');
 await expect(entries.nth(1)).toContainText(locale==='ja'?'サウンド設定で、再生状態':'Sound settings now include clearer playback states');
 await expect(entries.nth(2)).toContainText(locale==='ja'?'通知の履歴にチケット名':'Notification activity now shows ticket names');
 const unknownRelease=entries.nth(3);
 await expect(unknownRelease.locator('p').first()).toHaveText(locale==='ja'?'BarTicket を更新しました':'BarTicket updated');
 await expect(unknownRelease.locator('ul')).toHaveCount(0);
 expect(await section.locator('p').last().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`audit-release-history-manage-${locale}-${width}.png`),fullPage:true});
 await section.getByRole('button',{name:locale==='ja'?'更新を5件追加で表示':'Load 5 more updates'}).click();await expect(section.locator('ol > li')).toHaveCount(10);
 await section.getByRole('button',{name:locale==='ja'?'更新を5件追加で表示':'Load 5 more updates'}).click();await expect(section.locator('ol > li')).toHaveCount(12);
 await page.screenshot({path:testInfo.outputPath(`audit-release-history-${locale}-${width}.png`),fullPage:true});
 await page.reload();await expect(section.locator('ol > li')).toHaveCount(5);
});

test('dismiss and restore one release persists across reload without changing the public ledger',async({page})=>{
 await fixture(page);const ledger=JSON.stringify({schema:1,releases});const writes=[];page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method()))writes.push(r.url());});await page.goto('/notifications');
 const section=page.getByRole('region',{name:'App updates'});await expect(section.locator('ol > li')).toHaveCount(5);
 const title='Schedule calendar and ticket updates';
 await section.getByRole('button',{name:`Dismiss app update: ${title}`}).press('Enter');
 await expect(section.locator('ol > li')).toHaveCount(5);
 await expect(section.getByRole('button',{name:'View dismissed updates (1)'})).toBeVisible();
 await expect(section.locator('ol > li').first()).toContainText('Sound settings, Team Pay and menus');
 expect(await page.evaluate(()=>localStorage.getItem('barticket:release-dismissals:v1:7'))).toContain('"100:1"');
 await page.reload();await expect(section.locator('ol > li')).toHaveCount(5);
 await section.getByRole('button',{name:'View dismissed updates (1)'}).click();
 await expect(section.locator('ol > li')).toHaveCount(1);
 await expect(section.locator('ol > li').first()).toContainText(title);
 await section.getByRole('button',{name:`Restore app update: ${title}`}).press('Space');
 await expect(section.locator('ol > li')).toHaveCount(5);
 await expect(section.locator('ol > li').first()).toContainText(title);
 await expect(section.getByRole('button',{name:'View dismissed updates (0)'})).toHaveCount(0);
 expect(JSON.stringify({schema:1,releases})).toBe(ledger);expect(writes).toEqual([]);
});

test('dismiss all covers unloaded releases, and a new release stays active',async({page})=>{
 await fixture(page);let data=[...releases];const writes=[];
 await page.route('**/release-history.json',r=>r.fulfill({json:{schema:1,releases:data}}));
 page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method()))writes.push(r.url());});
 await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});
 await expect(section.locator('ol > li')).toHaveCount(5);
 await section.getByRole('button',{name:'Dismiss all'}).click();
 await expect(section).toContainText('All current updates are dismissed');
 await section.getByRole('button',{name:'View dismissed updates (12)'}).click();
 await expect(section.locator('ol > li')).toHaveCount(5);
 await section.getByRole('button',{name:'Load 5 more updates'}).click();await expect(section.locator('ol > li')).toHaveCount(10);
 await section.getByRole('button',{name:'Load 5 more updates'}).click();await expect(section.locator('ol > li')).toHaveCount(12);
 const newRelease={id:'200:1',sha:'e'.repeat(40),builtAt:'2026-12-01T13:00:00Z'};data=[newRelease,...data];
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(section.getByRole('button',{name:'View active updates (1)'})).toBeVisible();
 await section.getByRole('button',{name:'View active updates (1)'}).click();
 await expect(section.locator('ol > li')).toHaveCount(1);
 await expect(section.locator('ol > li').first()).toContainText('BarTicket updated');
 await expect(section.locator('ol > li').first()).toContainText('Version eeeeeee');
 expect(data).toHaveLength(13);expect(data[0]).toEqual(newRelease);expect(writes).toEqual([]);
});

test('dismissals stay isolated across accounts and logout',async({page})=>{
 await fixture(page,'en',7);await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});
 await expect(section.locator('ol > li')).toHaveCount(5);
 await section.getByRole('button',{name:'Dismiss app update: Schedule calendar and ticket updates'}).click();
 await page.evaluate(()=>{localStorage.setItem('barticket_token','TEST_ONLY_8');window.dispatchEvent(new Event('barticket-auth'));});
 await expect(section.locator('ol > li').first()).toContainText('Schedule calendar and ticket updates');
 await expect(section.getByRole('button',{name:/View dismissed updates/})).toHaveCount(0);
 await section.getByRole('button',{name:'Dismiss app update: Sound settings, Team Pay and menus'}).click();
 await page.evaluate(()=>{localStorage.setItem('barticket_token','TEST_ONLY_7');window.dispatchEvent(new Event('barticket-auth'));});
 await expect(section.locator('ol > li').first()).toContainText('Sound settings, Team Pay and menus');
 await section.getByRole('button',{name:'View dismissed updates (1)'}).click();
 await expect(section.locator('ol > li').first()).toContainText('Schedule calendar and ticket updates');
 await page.evaluate(()=>{localStorage.removeItem('barticket_token');window.dispatchEvent(new Event('barticket-auth'));});
 await expect(section.locator('ol > li').first()).toContainText('Schedule calendar and ticket updates');
 await expect(section.getByRole('group',{name:'Manage app updates'})).toHaveCount(0);
 await page.evaluate(()=>{localStorage.setItem('barticket_token','TEST_ONLY_8');window.dispatchEvent(new Event('barticket-auth'));});
 await expect(section.getByRole('button',{name:'View dismissed updates (1)'})).toBeVisible();
 await section.getByRole('button',{name:'View dismissed updates (1)'}).click();
 await expect(section.locator('ol > li').first()).toContainText('Sound settings, Team Pay and menus');
 expect(await page.evaluate(()=>[localStorage.getItem('barticket:release-dismissals:v1:7'),localStorage.getItem('barticket:release-dismissals:v1:8')])).toEqual([
  '{"schema":1,"accountId":7,"dismissedIds":["100:1"]}',
  '{"schema":1,"accountId":8,"dismissedIds":["99:1"]}',
 ]);
});

test('malformed dismissal data is ignored and can be replaced by a valid action',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('barticket:release-dismissals:v1:7','not-json'));
 await fixture(page);await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});
 await expect(section).toContainText('Some saved dismissal data was invalid and has been ignored');
 await expect(section.locator('ol > li')).toHaveCount(5);
 await section.getByRole('button',{name:'Dismiss all'}).click();
 await expect(section).not.toContainText('Some saved dismissal data was invalid');
 await expect(section).toContainText('All current updates are dismissed');
});

test('failed local dismissal writes keep the release visible and report the failure',async({page})=>{
 await fixture(page);await page.addInitScript(()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key.startsWith('barticket:release-dismissals:v1:'))throw new Error('storage denied');return original.call(this,key,value);};
 });
 await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});
 await expect(section.locator('ol > li')).toHaveCount(5);
 await section.getByRole('button',{name:'Dismiss app update: Schedule calendar and ticket updates'}).click();
 await expect(section.getByRole('alert')).toContainText('Could not save update dismissals');
 await expect(section.locator('ol > li').first()).toContainText('Schedule calendar and ticket updates');
 await expect(section.getByRole('button',{name:/View dismissed updates/})).toHaveCount(0);
});
test('missing history is an error with retry, not an empty success; refresh failure retains records',async({page})=>{
 await fixture(page);let fail=true;
 await page.route('**/release-history.json',r=>fail?r.fulfill({status:404,body:'missing'}):r.fulfill({json:{schema:1,releases:[releases[0],releases[0]]}}));
 await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});
 await expect(section).toContainText('Could not refresh app updates');await expect(section.locator('ol > li')).toHaveCount(0);
 fail=false;await section.getByRole('button',{name:'Retry',exact:true}).click();await expect(section.locator('ol > li')).toHaveCount(1);
 fail=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(section).toContainText('Showing the last loaded records');await expect(section.locator('ol > li')).toHaveCount(1);
});
test('empty history and published newer release are honest; no business write or sound is emitted',async({page})=>{
 await fixture(page);let data=[];const writes=[];
 page.on('request',r=>{if(['POST','PATCH','DELETE'].includes(r.method()))writes.push(r.url());});
 await page.route('**/release-history.json',r=>r.fulfill({json:{schema:1,releases:data}}));
 await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});await expect(section).toContainText('No app updates recorded yet');
 data=[releases[0]];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(section.locator('ol > li')).toHaveCount(1);
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(section.locator('ol > li')).toHaveCount(1);expect(writes).toEqual([]);
});
test('a future release with an unreviewed SHA receives no feature claims',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:900});await fixture(page,'en');
 await page.route('**/release-history.json',r=>r.fulfill({json:{schema:1,releases:[{id:'999:1',sha:unknownPrefixCollision,builtAt:'2026-12-01T13:00:00Z'}]}}));
 await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});
 const release=section.locator('ol > li').first();
 await expect(release.locator('p').first()).toHaveText('BarTicket updated');
 await expect(release.locator('ul')).toHaveCount(0);
 await expect(release).toContainText('d48c8f9');
 await page.screenshot({path:testInfo.outputPath('audit-release-history-future-unknown.png'),fullPage:true});
});
test('a release note attached to the current build describes that exact release',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:900});await fixture(page,'en');
 const note={title:{en:'Clearer app updates',ja:'アプリ更新内容を分かりやすく'},features:{en:['App updates now explain the features launched in each reviewed release in English and Japanese.'],ja:['アプリ更新履歴に、確認済みリリースで公開された機能を日本語と英語で表示します。']}};
 await page.route('**/release-history.json',r=>r.fulfill({json:{schema:1,releases:[{id:'1000:1',sha:'c'.repeat(40),builtAt:'2026-12-02T13:00:00Z',note}]}}));
 await page.goto('/notifications');const section=page.getByRole('region',{name:'App updates'});const release=section.locator('ol > li').first();
 await expect(release).toContainText('Clearer app updates');
 await expect(release).toContainText('App updates now explain the features launched in each reviewed release');
 await expect(release).toContainText('Version ccccccc');
 await page.screenshot({path:testInfo.outputPath('audit-release-history-current-release-note.png'),fullPage:true});
});
