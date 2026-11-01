import {test,expect} from '@playwright/test';
const API='http://127.0.0.1:8765';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PATCH,OPTIONS'};
async function isolate(page,locale='en') {
 await page.addInitScript(locale=>{localStorage.setItem('barticket_token','ISOLATED_STATE_FIXTURE');localStorage.setItem('barticket_locale',locale);},locale);
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
}
for(const locale of ['en','ja']) for(const failure of ['missing','rejected']) test(`chart copy ${failure} fallback ${locale}`,async({page},testInfo)=>{
 await page.setViewportSize({width:failure==='missing'?390:1280,height:844});await isolate(page,locale);
 await page.addInitScript(failure=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:failure==='missing'?undefined:{writeText:async()=>{throw new Error('Denied');}}}),failure);
 await page.goto(`/tests/browser/fixtures/state-feedback.html?locale=${locale}`);
 const ja=locale==='ja';
 await page.getByRole('button',{name:ja?'パネルをコピー':'Copy panel',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('textbox')).toHaveValue('Report\n2026-10-31\t¥1,200');
 await expect(dialog.getByRole('textbox')).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button')).toBeFocused();
 await page.keyboard.press('Tab');await expect(dialog.getByRole('textbox')).toBeFocused();
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
 expect(await dialog.evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(failure==='missing'?390:1280);
 await page.screenshot({path:testInfo.outputPath('audit-state-copy.png'),fullPage:true});
 await dialog.getByRole('button',{name:ja?'閉じる':'Close'}).click();await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:ja?'パネルをコピー':'Copy panel',exact:true})).toBeFocused();
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
 await page.locator('g[role=button]').first().click();
 await page.getByRole('button',{name:ja?'両方コピー':'Copy both',exact:true}).click();
 await expect(dialog.getByRole('textbox')).toHaveValue('Oct 31\t¥1,200');
 await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('');
 await expect(page.getByRole('button',{name:ja?'両方コピー':'Copy both',exact:true})).toBeFocused();
});
for(const locale of ['en','ja']) for(const width of [390,1280]) test(`account delayed autosave and failure retain edits ${locale} ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 await isolate(page,locale);let release;let fail=false;const writes=[];
 let user={id:7,name:'Fixture user',email:'fixture@example.invalid',role:'staff',has_password:true};
 await page.route(API+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(req.method()!=='GET') {
   writes.push(req.postDataJSON());
   if(path!=='/auth/me'||req.method()!=='PATCH')throw new Error('Unexpected fixture write');
   await new Promise(resolve=>{release=resolve;});
   return route.fulfill({status:fail?500:200,json:fail?{detail:'Fixture save failed'}:{...user,...req.postDataJSON()},headers});
  }
  return route.fulfill({json:path==='/auth/me'?user:path==='/tickets'?[]:path==='/menu'?{items:[]}:path==='/notices'?{notices:[]}:null,headers});
 });
 await page.goto('/profile?section=account');const ja=locale==='ja';
 const input=page.locator('input[aria-describedby="account-name-status"]');
 await page.locator('section input[type=password]').fill('fixture-password-not-sent');
 await input.fill('Updated name');await page.locator('section button').first().click();
 await expect(page.getByText(ja?'名前を保存中… 完了するまでお待ちください。':'Saving name… Please wait before making another change.')).toBeVisible();
 await expect(input).toBeDisabled();
 const section=page.locator('section[aria-busy="true"]');await expect(section.locator('button')).toHaveCount(2);
 for(const button of await section.locator('button').all())await expect(button).toBeDisabled();
 await expect.poll(()=>typeof release).toBe('function');release();
 await expect(page.getByText(ja?'名前を保存しました。':'Name saved.')).toBeVisible();
 expect(writes).toEqual([{name:'Updated name'}]);
 await expect(page.locator('section input[type=password]')).toHaveValue('fixture-password-not-sent');
 fail=true;release=undefined;await input.fill('Retry name');await input.press('Tab');
 await expect.poll(()=>typeof release).toBe('function');release();
 await expect(page.getByRole('button',{name:ja?'名前の保存を再試行':'Retry saving name'})).toBeVisible();
 await expect(input).toHaveValue('Retry name');await expect(input).toBeEnabled();
 await page.screenshot({path:testInfo.outputPath('audit-state-account-retry.png'),fullPage:true});
 expect(writes).toEqual([{name:'Updated name'},{name:'Retry name'}]);
 fail=false;release=undefined;await page.getByRole('button',{name:ja?'名前の保存を再試行':'Retry saving name'}).click();
 await expect.poll(()=>typeof release).toBe('function');release();
 await expect(page.getByText(ja?'名前を保存しました。':'Name saved.')).toBeVisible();
 await expect(page.locator('section input[type=password]')).toHaveValue('fixture-password-not-sent');
 release=undefined;await input.fill('Old account pending name');await input.press('Tab');
 await expect.poll(()=>typeof release).toBe('function');
 user={...user,id:8,name:'Next account'};
 await page.evaluate(()=>{localStorage.setItem('barticket_token','NEXT_ISOLATED_ACCOUNT');window.dispatchEvent(new Event('barticket-auth'));});
 await expect(input).toHaveValue('Next account');
 release();await expect(input).toBeEnabled();await expect(input).toHaveValue('Next account');
 await expect(page.locator('section input[type=password]')).toHaveValue('');
});
for(const locale of ['en','ja']) for(const width of [390,1280]) test(`close review distinguishes zero, unknown and invalidated totals ${locale} ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 await isolate(page,locale);let mode='zero';let release;const writes=[];
 const shift={id:10,business_date:'2026-10-31',status:'open',punches:[]};
 await page.route(API+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(req.method()!=='GET'){writes.push(path);return route.abort();}
  let body=null;
  if(path==='/shifts/current')body=shift;
  if(path==='/tickets')body=[];
  if(path==='/shifts/close-readiness') {
   if(mode==='hold')await new Promise(resolve=>{release=resolve;});
   const value=mode==='nonzero'?1200:0;
   body=mode==='missing'?null:{shift:mode==='mismatch'?{...shift,id:11}:shift,can_close:true,blockers:[],approved_carry_forwards:[],automatic_clock_out:{will_clock_out_count:0,will_clock_out_staff:[]},receivables:{outstanding_total:0},finalized_totals:{collected_total:value,cash_total:value,card_total:0,other_total:0}};
  }
  return route.fulfill({json:body,headers});
 });
 await page.goto(`/tests/browser/fixtures/state-feedback.html?view=shift&locale=${locale}`);
 const amount=page.locator('.shift-review-grid > div').nth(2).locator('strong');
 await expect(amount).toHaveText('¥0');
 for(const next of ['nonzero','mismatch','missing','zero']) {
  mode=next;await page.evaluate(()=>window.dispatchEvent(new Event('barticket-shift-updated')));
  await expect(amount).toHaveText(next==='nonzero'?'¥1,200':next==='zero'?'¥0':'—');
 }
 mode='hold';await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(amount).toHaveText('—');
 await expect.poll(()=>typeof release).toBe('function');
 await expect(page.getByRole('button',{name:locale==='ja'?'確認してシフトを閉じる':'Confirm & close shift'})).toBeDisabled();
 await page.screenshot({path:testInfo.outputPath('audit-state-shift-unknown.png'),fullPage:true});
 mode='zero';release();await expect(amount).toHaveText('¥0');expect(writes).toEqual([]);
});
test('clipboard success appears only after write resolves',async({page})=>{
 await page.setViewportSize({width:768,height:1024});await isolate(page);
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise(resolve=>{window.resolveFixtureCopy=resolve;})}}));
 await page.goto('/tests/browser/fixtures/state-feedback.html');
 await page.getByRole('button',{name:'Copy panel',exact:true}).click();
 await expect(page.getByText('Copied!',{exact:true})).toHaveCount(0);
 await page.evaluate(()=>window.resolveFixtureCopy());
 await expect(page.getByText('Copied!',{exact:true})).toBeVisible();
 await expect(page.getByRole('dialog')).toHaveCount(0);
});

for(const locale of ['en','ja']) for(const width of [390,1280]) test(`bounded feed explains short post-filter list ${locale} ${width}`,async({page},testInfo)=>{
 await isolate(page,locale);await page.setViewportSize({width,height:844});
 await page.goto(`/tests/browser/fixtures/state-feedback.html?view=feed&locale=${locale}`);
 await expect(page.getByText(locale==='ja'?/最近のアクティビティのみを表示しています/:/Recent activity only/)).toBeVisible();
 await expect(page.getByText(locale==='ja'?'最近のアクティビティに追加の項目はありません。':'No additional items in recent activity.')).toBeVisible();
 await expect(page.getByText('No activity in this shift yet.')).toHaveCount(0);
 await expect(page.locator('li')).toHaveCount(0);
 await page.screenshot({path:testInfo.outputPath('audit-state-feed.png'),fullPage:true});
});

test('late clipboard failures cannot replace newer success or a different selected bar',async({page})=>{
 await isolate(page);
 await page.addInitScript(()=>{window.fixtureCopies=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>new Promise((resolve,reject)=>window.fixtureCopies.push({resolve,reject}))}});});
 await page.goto('/tests/browser/fixtures/state-feedback.html');
 const panel=page.getByRole('button',{name:'Copy panel',exact:true});
 await panel.click();await panel.click();
 await page.evaluate(()=>window.fixtureCopies[1].resolve());await expect(page.getByText('Copied!',{exact:true})).toBeVisible();
 await page.evaluate(()=>window.fixtureCopies[0].reject(new Error('Old failure')));await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('g[role=button]').first().click();await page.getByRole('button',{name:'Copy both'}).click();
 await page.locator('g[role=button]').nth(1).click();
 await page.evaluate(()=>window.fixtureCopies[2].reject(new Error('Old selection')));await expect(page.getByRole('dialog')).toHaveCount(0);
 await panel.click();await page.evaluate(()=>window.dispatchEvent(new Event('fixture-unmount')));
 await page.evaluate(()=>window.fixtureCopies[3].reject(new Error('Unmounted')));await expect(page.getByRole('dialog')).toHaveCount(0);
});

for(const locale of ['en','ja']) test(`manual copy unmount restores previous body overflow ${locale}`,async({page})=>{
 await isolate(page,locale);
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
 await page.goto(`/tests/browser/fixtures/state-feedback.html?locale=${locale}`);
 await page.evaluate(()=>{document.body.style.overflow='auto';});
 await page.getByRole('button',{name:locale==='ja'?'パネルをコピー':'Copy panel',exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
 await page.evaluate(()=>window.dispatchEvent(new Event('fixture-unmount')));
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(()=>document.body.style.overflow)).toBe('auto');
});
