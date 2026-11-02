import { test, expect } from '@playwright/test';
const manager={id:901,name:'Fixture Manager',role:'manager',email:'manager@example.invalid'};
const staff={id:903,name:'Fixture Staff',role:'staff',email:'staff@example.invalid'};
async function setup(page,locale='en',role='manager') {
 const state={reads:[],writes:[],conflict:false,revision:"a".repeat(64)};
 await page.clock.install({time:new Date('2026-11-02T12:00:00Z')});
 await page.addInitScript(({locale})=>{localStorage.setItem('barticket_token','SCHEDULE_TEST');localStorage.setItem('barticket_locale',locale);},{locale});
 const rows=Array.from({length:30},(_,i)=>({id:i+1,business_date:`2026-11-${String(i+1).padStart(2,'0')}`,manager:{name:'Nori',user_id:null},staff:i%7===0?[]:[{name:'Haruka',user_id:903}],event_value:i===11?'Live music':'Open',revision:'a'.repeat(64),schedule_state:'upcoming',actual_shift_exists:i<2,hours:null,provenance:[{source_file:'november-sheet.csv',source_row:i+2,imported_by:'Chuck',imported_at:'2026-11-02T00:00:00Z',uncertainty:null}]}));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('http://127.0.0.1:8765/**',async r=>{const q=r.request(),u=new URL(q.url());const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};if(q.method()==='OPTIONS')return r.fulfill({status:204,headers});let body=[],status=200;
 if(q.method()!=='GET'){state.writes.push({path:u.pathname,body:q.postDataJSON()});if(state.conflict){status=409;body={detail:'Concurrent change'};}else body={...rows[1],...q.postDataJSON()};}
 else if(u.pathname==='/auth/me')body=role==='manager'?manager:staff;else if(u.pathname==='/users')body=[manager,staff];else if(u.pathname==='/schedules'){state.reads.push(u.search);body=u.search.includes('2026-11')?rows.map(row=>({...row,revision:state.revision})):[];}else if(u.pathname==='/auth/status')body={has_accounts:true,google_enabled:false};else if(u.pathname==='/shifts/current')body=null;else if(u.pathname==='/menu')body={items:[],coverCharge:500};else if(u.pathname==='/notices')body={notices:[]};
 await r.fulfill({status,json:body,headers});});return state;
}
for(const locale of ['en','ja'])for(const width of [320,390,768,1280])test(`calendar pixels ${locale} ${width}`,async({page},info)=>{
 await setup(page,locale);await page.setViewportSize({width,height:900});await page.goto('/schedules');await expect(page.getByRole('heading',{name:locale==='ja'?'シフト予定':'Schedule',exact:true})).toBeVisible();await expect(page.getByText('Haruka').first()).toBeVisible();
 await page.screenshot({path:info.outputPath('calendar.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await page.getByRole('button',{name:locale==='ja'?'今日':'Today',exact:true}).click();await page.getByRole('button',{name:locale==='ja'?'予定を編集':'Edit plan',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:info.outputPath('editor.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 const managerSelect=page.getByRole('combobox',{name:locale==='ja'?'マネージャー':'Manager',exact:true});await managerSelect.click();const listbox=page.getByRole('listbox');await expect(listbox).toBeVisible();
 await expect(listbox).toHaveCSS('opacity','1');await expect.poll(()=>listbox.evaluate(el=>getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
 await managerSelect.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{}))));
 expect(await listbox.evaluate(el=>{const background=getComputedStyle(el).backgroundColor;return {inDialog:!!el.closest('dialog'),opaque:!background.startsWith('rgba(')||background.endsWith(', 1)'),animating:el.getAnimations({subtree:true}).some(a=>a.playState==='running'||a.pending),uncovered:[...el.querySelectorAll('[role=option]')].every(option=>{const r=option.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})};})).toEqual({inDialog:true,opaque:true,animating:false,uncovered:true});
 await page.screenshot({path:info.outputPath('editor-manager-menu.png'),fullPage:true});await managerSelect.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(managerSelect).toBeFocused();
});
test('manager draft stays on conflict; cancel is guarded; reads limited to month; staff cannot edit',async({page})=>{
 const state=await setup(page);await page.goto('/schedules');await page.getByRole('button',{name:'Today',exact:true}).click();await page.getByRole('button',{name:'Edit plan',exact:true}).click();await page.getByLabel('Event',{exact:true}).fill('Changed event');state.revision='b'.repeat(64);await page.evaluate(()=>window.dispatchEvent(new Event('barticket-schedules-updated')));await expect.poll(()=>state.reads.length).toBeGreaterThan(1);state.conflict=true;await page.getByRole('button',{name:'Save plan',exact:true}).click();await expect(page.getByRole('alert')).toContainText('nothing was overwritten');await expect(page.getByLabel('Event',{exact:true})).toHaveValue('Changed event');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(state.writes).toHaveLength(1);expect(state.writes[0].body.expected_revision).toBe('a'.repeat(64));expect(state.reads[0]).toContain('date_from=2026-11-01');expect(state.reads[0]).toContain('date_to=2026-11-30');
});
test('staff read-only; offline timer does not request',async({page})=>{const state=await setup(page,'en','staff');await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();await expect(page.getByRole('button',{name:'+ Create',exact:true})).toHaveCount(0);const before=state.reads.length;await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));await page.clock.fastForward(600000);expect(state.reads.length).toBe(before);expect(state.writes).toEqual([]);});
test('unrelated storage leaves manager controls; create is new; dirty Back and Forward preserve draft',async({page})=>{
 await setup(page);await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'barticket_locale',newValue:'ja'})));
 await expect(page.getByRole('button',{name:'+ Create',exact:true})).toBeVisible();
 await page.evaluate(()=>history.pushState({...history.state,idx:history.state.idx+1},'',location.href));
 await page.getByRole('button',{name:'+ Create',exact:true}).click();await expect(page.getByRole('heading',{name:'New plan'})).toBeVisible();await page.getByLabel('Event',{exact:true}).fill('Unsaved new event');
 page.once('dialog',d=>d.dismiss());await page.evaluate(()=>history.back());await expect(page.getByLabel('Event',{exact:true})).toHaveValue('Unsaved new event');
 page.once('dialog',d=>d.dismiss());await page.evaluate(()=>history.back());await expect(page.getByLabel('Event',{exact:true})).toHaveValue('Unsaved new event');
});
test('hidden interval requests nothing and returning visible coalesces one refresh',async({page})=>{
 const state=await setup(page);await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();const before=state.reads.length;
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(600000);expect(state.reads.length).toBe(before);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});await expect.poll(()=>state.reads.length).toBe(before+1);
});
test('late previous-month read cannot replace latest month; signed-out data clears',async({page})=>{
 const state=await setup(page);await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();let release;const held=new Promise(resolve=>release=resolve);
 await page.route('**/schedules?date_from=2026-11-01*',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,OPTIONS'}});await held;await route.fulfill({json:[{id:9000,business_date:'2026-11-02',manager:{name:'STALE_RESPONSE',user_id:null},staff:[],event_value:'Old month',revision:'c'.repeat(64),provenance:[],hours:null}],headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.evaluate(()=>window.dispatchEvent(new Event('barticket-schedules-updated')));await page.getByRole('button',{name:'Next month',exact:true}).click();await expect.poll(()=>state.reads.some(query=>query.includes('2026-12'))).toBe(true);const oldResponse=page.waitForResponse(response=>response.request().method()==='GET'&&response.url().includes('date_from=2026-11-01'));release();await oldResponse;await expect(page.getByText('STALE_RESPONSE')).toHaveCount(0);
 await page.evaluate(()=>{localStorage.removeItem('barticket_token');window.dispatchEvent(new Event('barticket-auth'));});await expect(page.getByText('Haruka')).toHaveCount(0);await expect(page.getByRole('button',{name:'+ Create',exact:true})).toHaveCount(0);
});

for (const locale of ['en', 'ja']) for (const width of [320, 390, 768]) test(`calendar conflict pixels ${locale} ${width}`, async ({ page }, info) => {
 const state = await setup(page, locale);
 await page.setViewportSize({ width, height: 900 });
 await page.goto('/schedules');
 await page.getByRole('button', { name: locale === 'ja' ? '今日' : 'Today', exact: true }).click();
 await page.getByRole('button', { name: locale === 'ja' ? '予定を編集' : 'Edit plan', exact: true }).click();
 const dialog = page.getByRole('dialog');
 const event = dialog.getByLabel(locale === 'ja' ? 'イベント' : 'Event', { exact: true });
 const draft = locale === 'ja' ? '未保存のライブイベント変更' : 'Unsaved live music change';
 await event.fill(draft);
 state.revision = 'b'.repeat(64);
 await page.evaluate(() => window.dispatchEvent(new Event('barticket-schedules-updated')));
 await expect.poll(() => state.reads.length).toBeGreaterThan(1);
 state.conflict = true;
 await dialog.getByRole('button', { name: locale === 'ja' ? '予定を保存' : 'Save plan', exact: true }).click();
 const alert = dialog.getByRole('alert');
 await expect(alert).toContainText(locale === 'ja' ? '上書きしていません。' : 'nothing was overwritten');
 await expect(dialog).toBeVisible();
 await expect(event).toHaveValue(draft);
 await expect(event).toBeVisible();
 await expect(alert).toBeVisible();
 await alert.scrollIntoViewIfNeeded();
 await expect(alert).toBeInViewport({ ratio: 1 });
 await expect(dialog.getByRole('button', { name: locale === 'ja' ? 'キャンセル' : 'Cancel', exact: true })).toBeInViewport({ ratio: 1 });
 await expect(dialog.getByRole('button', { name: locale === 'ja' ? '予定を保存' : 'Save plan', exact: true })).toBeInViewport({ ratio: 1 });
 expect(state.writes).toHaveLength(1);
 expect(state.writes[0].body.expected_revision).toBe('a'.repeat(64));
 expect(state.writes[0].body.event_value).toBe(draft);
 const bounds = await dialog.evaluate(el => ({ left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth }));
 expect(bounds.left).toBeGreaterThanOrEqual(0);
 expect(bounds.right).toBeLessThanOrEqual(width);
 expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await dialog.screenshot({ path: info.outputPath('audit-calendar-conflict-status.png') });
 await event.scrollIntoViewIfNeeded();
 await expect(event).toBeInViewport({ ratio: 1 });
 await expect(event).toHaveValue(draft);
 await dialog.screenshot({ path: info.outputPath('audit-calendar-conflict-draft.png') });
});
