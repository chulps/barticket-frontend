import { test, expect } from '@playwright/test';
const manager={id:901,name:'Fixture Manager',role:'manager',email:'manager@example.invalid'};
const staff={id:903,name:'Fixture Staff',role:'staff',email:'staff@example.invalid'};
async function setup(page,locale='en',role='manager',time='2026-11-02T12:00:00Z',rowOverrides={}) {
 const state={reads:[],writes:[],contextReads:[],conflict:false,revision:"a".repeat(64)};
 await page.clock.install({time:new Date(time)});
 await page.addInitScript(({locale})=>{localStorage.setItem('barticket_token','SCHEDULE_TEST');localStorage.setItem('barticket_locale',locale);},{locale});
 const rows=Array.from({length:30},(_,i)=>({id:i+1,business_date:`2026-11-${String(i+1).padStart(2,'0')}`,manager:{name:'Nori',user_id:null},staff:i%7===0?[]:[{name:'Haruka',user_id:903}],event_value:i===11?'Live music':'Open',revision:'a'.repeat(64),schedule_state:'upcoming',actual_shift_exists:i<2,actual_shift_status:i===0?'closed':i===1?'open':null,actual_shift_closed_at:i===0?'2026-11-01T16:00:00Z':null,venue_status:i===12?'closed':null,venue_event:i===12?'Weather closure':null,hours:null,provenance:[{source_file:'november-sheet.csv',source_row:i+2,imported_by:'Chuck',imported_at:'2026-11-02T00:00:00Z',uncertainty:null}]}));
 rows.push({id:31,business_date:'2026-10-31',manager:{name:'Nori',user_id:null},staff:[],event_value:'Open',revision:'a'.repeat(64),schedule_state:'past',actual_shift_exists:false,actual_shift_status:null,actual_shift_closed_at:null,venue_status:null,venue_event:null,hours:null,provenance:[]});
 for(const row of rows)Object.assign(row,rowOverrides[row.business_date]??{});
 state.rows=rows;
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('http://127.0.0.1:8765/**',async r=>{const q=r.request(),u=new URL(q.url());const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};if(q.method()==='OPTIONS')return r.fulfill({status:204,headers});let body=[],status=200;
 if(q.method()!=='GET'){state.writes.push({path:u.pathname,body:q.postDataJSON()});if(state.conflict){status=409;body={detail:'Concurrent change'};}else body={...rows[1],...q.postDataJSON()};}
 else if(u.pathname==='/auth/me')body=role==='manager'?manager:staff;else if(u.pathname==='/users')body=[manager,staff];else if(u.pathname==='/schedules/context'){state.contextReads.push(q.headers()['authorization']??'');const now=new Date(await page.evaluate(()=>Date.now()));const tokyoDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(now);const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',hourCycle:'h23'}).format(now));const parts=tokyoDate.split('-').map(Number);const calendar=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]-(hour<12?1:0))).toISOString().slice(0,10);body={operational_business_date:calendar,calendar_business_date:calendar,actual_shift_status:null,actual_shift_business_date:null};}else if(u.pathname==='/schedules'){state.reads.push(u.search);const from=u.searchParams.get('date_from'),to=u.searchParams.get('date_to');body=state.rows.filter(row=>row.business_date>=from&&row.business_date<=to).map(row=>({...row,revision:state.revision}));}else if(u.pathname==='/auth/status')body={has_accounts:true,google_enabled:false};else if(u.pathname==='/shifts/current')body=null;else if(u.pathname==='/menu')body={items:[],coverCharge:500};else if(u.pathname==='/notices')body={notices:[]};
 await r.fulfill({status,json:body,headers});});return state;
}
async function selectScheduleType(page, value, locale='en') {
 const labels=locale==='ja'?{open:'営業',event:'イベント',closed:'休業'}:{open:'Open',event:'Event',closed:'Closed'};
 const combo=page.getByRole('combobox',{name:locale==='ja'?'予定の種類':'Schedule type',exact:true});await combo.click();await page.getByRole('option',{name:labels[value],exact:true}).click();await expect(combo).toHaveAttribute('data-select-value',value);
}
for(const locale of ['en','ja'])for(const width of [320,390,768,1280])test(`calendar pixels ${locale} ${width}`,async({page},info)=>{
 const state=await setup(page,locale);await page.setViewportSize({width,height:900});await page.goto('/schedules');await expect(page.getByRole('heading',{name:locale==='ja'?'シフト予定':'Schedule',exact:true})).toBeVisible();await expect(page.getByText('Haruka').first()).toBeVisible();
 const subtitle=page.getByText(locale==='ja'?'勤務予定（打刻記録とは別）':'Plans, not clock-in records',{exact:true}),controls=page.getByRole('group',{name:locale==='ja'?'予定表示の操作':'Schedule controls',exact:true}),subtitleBox=await subtitle.boundingBox(),controlsBox=await controls.boundingBox();expect(await subtitle.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(await subtitle.evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);return new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size;})).toBe(1);if(width<=600)expect(controlsBox.y).toBeGreaterThanOrEqual(subtitleBox.y+subtitleBox.height);
 await page.getByRole('tab',{name:locale==='ja'?'週':'Week',exact:true}).click();await expect.poll(()=>state.reads.some(query=>rangeOf(query).from==='2026-11-01'&&rangeOf(query).to==='2026-11-07')).toBe(true);await expectWeek(page,'2026-11-01');await expect(weekPanel(page).locator('button[aria-label^="2026-11-"]')).toHaveCount(7);await expect(page.getByText(locale==='ja'?'予定を読み込んでいます…':'Loading schedules…',{exact:true})).toHaveCount(0);await page.screenshot({path:info.outputPath('audit-week-calendar.png'),fullPage:true});
 await page.getByRole('tab',{name:locale==='ja'?'月':'Month',exact:true}).click();const monthTitle=page.getByRole('button',{name:locale==='ja'?'月間カレンダーを表示':'Show month calendar',exact:true});await expect(monthTitle).toBeVisible();expect(await monthTitle.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(Number.parseFloat(await monthTitle.evaluate(el=>getComputedStyle(el).fontSize))).toBeLessThanOrEqual(18);await page.screenshot({path:info.outputPath('calendar.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 const today=page.getByRole('button',{name:locale==='ja'?'今日':'Today',exact:true});await today.click();const detailClose=page.getByRole('button',{name:locale==='ja'?'詳細を閉じる':'Close day details',exact:true}),detailBounds=await detailClose.boundingBox();expect(detailBounds.width).toBe(44);expect(detailBounds.height).toBe(44);expect(await detailClose.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');await detailClose.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await expect(detailClose).toBeFocused();expect(await detailClose.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');await page.screenshot({path:info.outputPath('day-details.png'),fullPage:true});await detailClose.press('Enter');await expect(page.getByRole('complementary',{name:locale==='ja'?'選択した日':'Selected day'})).toHaveCount(0);await expect(today).toBeFocused();
 await today.click();await page.getByRole('button',{name:locale==='ja'?'予定を編集':'Edit plan',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:info.outputPath('editor.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await selectScheduleType(page,'event',locale);const eventNotes=page.getByLabel(locale==='ja'?'イベントのメモ':'Event notes',{exact:true});await expect(eventNotes).toBeVisible();const notesBounds=await eventNotes.boundingBox();expect(notesBounds.x).toBeGreaterThanOrEqual(0);expect(notesBounds.x+notesBounds.width).toBeLessThanOrEqual(width);await page.screenshot({path:info.outputPath('editor-event-notes.png'),fullPage:true});
 const managerSelect=page.getByRole('combobox',{name:locale==='ja'?'マネージャー':'Manager',exact:true});await managerSelect.click();const listbox=page.getByRole('listbox');await expect(listbox).toBeVisible();
 await expect(listbox).toHaveCSS('opacity','1');await expect.poll(()=>listbox.evaluate(el=>getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
 await managerSelect.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{}))));
 expect(await listbox.evaluate(el=>{const background=getComputedStyle(el).backgroundColor;return {inDialog:!!el.closest('dialog'),opaque:!background.startsWith('rgba(')||background.endsWith(', 1)'),animating:el.getAnimations({subtree:true}).some(a=>a.playState==='running'||a.pending),uncovered:[...el.querySelectorAll('[role=option]')].every(option=>{const r=option.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})};})).toEqual({inDialog:true,opaque:true,animating:false,uncovered:true});
 await page.screenshot({path:info.outputPath('editor-manager-menu.png'),fullPage:true});await managerSelect.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(managerSelect).toBeFocused();
});
for(const locale of ['en','ja'])test(`schedule type options and event notes survive switching (${locale})`,async({page})=>{
 const state=await setup(page,locale);await page.goto('/schedules');await page.getByRole('button',{name:locale==='ja'?'＋ 作成':'+ Create',exact:true}).click();
 const type=page.getByRole('combobox',{name:locale==='ja'?'予定の種類':'Schedule type',exact:true}),notesLabel=locale==='ja'?'イベントのメモ':'Event notes';
 await type.click();await expect(page.getByRole('option')).toHaveText(locale==='ja'?['営業','イベント','休業']:['Open','Event','Closed']);await type.press('Escape');await expect(type).toHaveAttribute('data-select-value','open');await expect(page.getByLabel(notesLabel,{exact:true})).toHaveCount(0);
 await selectScheduleType(page,'event',locale);const notes=page.getByLabel(notesLabel,{exact:true});await expect(notes).toBeVisible();await notes.fill(locale==='ja'?'Nori ライブ':'Nori live set');
 await selectScheduleType(page,'closed',locale);await expect(notes).toHaveCount(0);await expect(type).toHaveAttribute('data-select-value','closed');
 await selectScheduleType(page,'event',locale);await expect(notes).toHaveValue(locale==='ja'?'Nori ライブ':'Nori live set');
 await page.getByRole('button',{name:locale==='ja'?'予定を保存':'Save plan',exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);
 expect(state.writes[0].body).toMatchObject({schedule_type:'event',event_notes:locale==='ja'?'Nori ライブ':'Nori live set',event_value:locale==='ja'?'Nori ライブ':'Nori live set'});
});
test('legacy schedule labels open closed and event title load as the matching editor values',async({page})=>{
 await setup(page,'en','manager','2026-11-02T12:00:00Z',{
  '2026-11-03':{event_value:'Closed'},'2026-11-04':{event_value:'Live music'},
 });await page.goto('/schedules');await page.getByRole('tab',{name:'Month',exact:true}).click();
 for(const [day,expectedType,expectedNotes] of [['Tuesday, November 3, 2026','closed',null],['Wednesday, November 4, 2026','event','Live music']]){
  await page.getByRole('button',{name:day,exact:true}).click();await page.getByRole('button',{name:'Edit plan',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Schedule type',exact:true})).toHaveAttribute('data-select-value',expectedType);
  if(expectedNotes)await expect(page.getByLabel('Event notes',{exact:true})).toHaveValue(expectedNotes);else await expect(page.getByLabel('Event notes',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
 }
});
test('past dates are read-only; a Tokyo noon rollover closes an open editor',async({page})=>{
 await setup(page,'en','manager','2026-11-02T02:50:00Z',{'2026-11-01':{actual_shift_exists:false,actual_shift_status:null,actual_shift_closed_at:null}});await page.setViewportSize({width:390,height:844});await page.goto('/schedules');await page.getByRole('tab',{name:'Month',exact:true}).click();
 await page.getByRole('button',{name:'Today',exact:true}).click();
 await page.getByRole('button',{name:'Edit plan',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.clock.fastForward(11*60*1000);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByText('Past schedule dates are read-only. Historical plans and assignments cannot be changed.',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'+ Create',exact:true})).toHaveCount(0);
});
test('new plans allow today and future but block a past business date',async({page})=>{
 await setup(page,'en');await page.goto('/schedules');await page.getByRole('button',{name:'+ Create',exact:true}).click();
 const date=page.getByLabel('Business date',{exact:true});
 await expect(date).toHaveAttribute('min','2026-11-02');
 await date.fill('2026-11-01');
 await expect(page.getByRole('button',{name:'Save plan',exact:true})).toBeDisabled();
 await expect(page.getByRole('status')).toContainText('Past schedule dates are read-only');
 await date.fill('2026-11-02');await expect(page.getByRole('button',{name:'Save plan',exact:true})).toBeEnabled();
 await date.fill('2026-11-03');await expect(page.getByRole('button',{name:'Save plan',exact:true})).toBeEnabled();
});
test('next planned shift can be Today while intervening calendar-future dates remain editable',async({page})=>{
 await setup(page,'en','manager','2026-11-13T12:00:00Z');await page.route('**/schedules/context',route=>route.fulfill({json:{operational_business_date:'2026-11-17',calendar_business_date:'2026-11-13',actual_shift_status:null,actual_shift_business_date:null},headers:{'Access-Control-Allow-Origin':'*'}}));await page.setViewportSize({width:390,height:844});await page.goto('/schedules');
 await page.getByRole('tab',{name:'Month',exact:true}).click();
 await expect(page.getByRole('button',{name:'Tuesday, November 17, 2026',exact:true})).toHaveAttribute('aria-current','date');await page.getByRole('button',{name:'Saturday, November 14, 2026',exact:true}).click();await expect(page.getByRole('button',{name:'+ Create',exact:true})).toBeVisible();await page.getByRole('button',{name:'+ Create',exact:true}).click();await expect(page.getByLabel('Business date',{exact:true})).toHaveAttribute('min','2026-11-13');await expect(page.getByLabel('Business date',{exact:true})).toHaveValue('2026-11-14');await expect(page.getByRole('button',{name:'Save plan',exact:true})).toBeEnabled();
});
test('an active overnight shift date remains editable after the Tokyo calendar rolls forward',async({page})=>{
 await setup(page,'en','manager','2026-11-13T12:00:00Z');await page.route('**/schedules/context',route=>route.fulfill({json:{operational_business_date:'2026-11-12',calendar_business_date:'2026-11-13',actual_shift_status:'open',actual_shift_business_date:'2026-11-12'},headers:{'Access-Control-Allow-Origin':'*'}}));await page.setViewportSize({width:390,height:844});await page.goto('/schedules');
 await page.getByRole('tab',{name:'Month',exact:true}).click();
 await expect(page.getByRole('button',{name:'Thursday, November 12, 2026',exact:true})).toHaveAttribute('aria-current','date');await page.getByRole('button',{name:'Thursday, November 12, 2026',exact:true}).click();await expect(page.getByRole('button',{name:'Edit plan',exact:true})).toBeVisible();await page.getByRole('button',{name:'Edit plan',exact:true}).click();await expect(page.getByLabel('Business date',{exact:true})).toHaveAttribute('min','2026-11-12');await expect(page.getByRole('button',{name:'Save plan',exact:true})).toBeEnabled();
});
test('manager draft stays on conflict; cancel is guarded; reads limited to month; staff cannot edit',async({page})=>{
 const state=await setup(page);await page.goto('/schedules');await page.getByRole('button',{name:'Today',exact:true}).click();await page.getByRole('button',{name:'Edit plan',exact:true}).click();await selectScheduleType(page,'event');await page.getByLabel('Event notes',{exact:true}).fill('Changed event');state.revision='b'.repeat(64);await page.evaluate(()=>window.dispatchEvent(new Event('barticket-schedules-updated')));await expect.poll(()=>state.reads.length).toBeGreaterThan(1);state.conflict=true;await page.getByRole('button',{name:'Save plan',exact:true}).click();await expect(page.getByRole('alert')).toContainText('nothing was overwritten');await expect(page.getByLabel('Event notes',{exact:true})).toHaveValue('Changed event');page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(state.writes).toHaveLength(1);expect(state.writes[0].body.expected_revision).toBe('a'.repeat(64));expect(state.reads[0]).toContain('date_from=2026-11-01');expect(state.reads[0]).toContain('date_to=2026-11-30');
});
test('staff read-only; offline timer does not request',async({page})=>{const state=await setup(page,'en','staff');await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();await expect(page.getByRole('button',{name:'+ Create',exact:true})).toHaveCount(0);const before=state.reads.length;await page.evaluate(()=>Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false}));await page.clock.fastForward(600000);expect(state.reads.length).toBe(before);expect(state.writes).toEqual([]);});
test('unrelated storage leaves manager controls; create is new; dirty Back and Forward preserve draft',async({page})=>{
 await setup(page);await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'barticket_locale',newValue:'ja'})));
 await expect(page.getByRole('button',{name:'+ Create',exact:true})).toBeVisible();
 await page.evaluate(()=>history.pushState({...history.state,idx:history.state.idx+1},'',location.href));
 await page.getByRole('button',{name:'+ Create',exact:true}).click();await expect(page.getByRole('heading',{name:'New plan'})).toBeVisible();await selectScheduleType(page,'event');await page.getByLabel('Event notes',{exact:true}).fill('Unsaved new event');
 page.once('dialog',d=>d.dismiss());await page.evaluate(()=>history.back());await expect(page.getByLabel('Event notes',{exact:true})).toHaveValue('Unsaved new event');
 page.once('dialog',d=>d.dismiss());await page.evaluate(()=>history.back());await expect(page.getByLabel('Event notes',{exact:true})).toHaveValue('Unsaved new event');
});
test('healthy schedule socket suppresses minute reads while shift invalidation and fallback still refresh',async({page})=>{
 const state=await setup(page);let socket,provideReady=true;
 await page.routeWebSocket('**/realtime/ws',peer=>{socket=peer;peer.onMessage(message=>{if(JSON.parse(message).type==='authenticate'&&provideReady)peer.send(JSON.stringify({type:'ready',version:1,cursor:0}));});});
 await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();await expect.poll(()=>!!socket).toBe(true);await page.clock.runFor(100);
 let reads=state.reads.length,contexts=state.contextReads.length;await page.clock.fastForward(60000);expect(state.reads.length).toBe(reads);expect(state.contextReads.length).toBe(contexts);
 await page.evaluate(()=>window.dispatchEvent(new Event('barticket-shift-updated')));await expect.poll(()=>state.reads.length).toBeGreaterThan(reads);await expect.poll(()=>state.contextReads.length).toBeGreaterThan(contexts);
 reads=state.reads.length;contexts=state.contextReads.length;provideReady=false;socket.close({code:1012,reason:'fixture disconnect'});await page.clock.runFor(100);await page.clock.fastForward(60000);expect(state.reads.length).toBeGreaterThan(reads);expect(state.contextReads.length).toBeGreaterThan(contexts);
});
test('healthy schedule socket still refreshes authoritative context at the Tokyo business-day rollover',async({page})=>{
 const state=await setup(page,'en','manager','2026-11-02T02:59:00Z');
 await page.routeWebSocket('**/realtime/ws',peer=>{peer.onMessage(message=>{if(JSON.parse(message).type==='authenticate')peer.send(JSON.stringify({type:'ready',version:1,cursor:0}));});});
 await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();const reads=state.reads.length,contexts=state.contextReads.length;
 await page.clock.fastForward(60000);await expect(page.locator('[aria-current="date"]')).toHaveAttribute('aria-label','Monday, November 2, 2026');
 expect(state.reads.length).toBe(reads);expect(state.contextReads.length).toBeGreaterThan(contexts);
});
test('hidden interval requests nothing and returning visible coalesces one refresh',async({page})=>{
 const state=await setup(page);await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();const before=state.reads.length, contextBefore=state.contextReads.length;
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.fastForward(600000);expect(state.reads.length).toBe(before);expect(state.contextReads.length).toBe(contextBefore);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));});await expect.poll(()=>state.reads.length).toBe(before+1);await expect.poll(()=>state.contextReads.length).toBeGreaterThan(contextBefore);
});
test('initial hidden/offline schedule mount performs no schedule or context reads',async({page})=>{
 const state=await setup(page);await page.addInitScript(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});});await page.goto('/schedules');await page.clock.fastForward(600000);expect(state.reads).toHaveLength(0);expect(state.contextReads).toHaveLength(0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'));document.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>state.contextReads.length).toBeGreaterThan(0);await expect.poll(()=>state.reads.length).toBeGreaterThan(0);
});
test('context requests are single-flight, auth-scoped, and stale completion cannot restore old date',async({page})=>{
 const state=await setup(page);let releaseA,releaseB;const pendingA=new Promise(resolve=>releaseA=resolve),pendingB=new Promise(resolve=>releaseB=resolve);let bCalls=0;
 await page.route('**/schedules/context',async route=>{const auth=route.request().headers()['authorization'];state.contextReads.push(auth??'');if(auth==='Bearer SCHEDULE_TEST'){await pendingA;return route.fulfill({json:{operational_business_date:'2026-11-01',calendar_business_date:'2026-11-01',actual_shift_status:null,actual_shift_business_date:null},headers:{'Access-Control-Allow-Origin':'*'}});}bCalls++;if(bCalls===1)await pendingB;return route.fulfill({json:{operational_business_date:'2026-11-03',calendar_business_date:'2026-11-02',actual_shift_status:null,actual_shift_business_date:null},headers:{'Access-Control-Allow-Origin':'*'}});});
 await page.goto('/schedules');await expect.poll(()=>state.contextReads.filter(auth=>auth==='Bearer SCHEDULE_TEST').length).toBe(1);
 await page.evaluate(()=>{localStorage.setItem('barticket_token','SESSION_B');window.dispatchEvent(new Event('barticket-auth'));});await expect.poll(()=>state.contextReads.filter(auth=>auth==='Bearer SESSION_B').length).toBe(1);
 await page.evaluate(()=>{window.dispatchEvent(new Event('barticket-shift-updated'));window.dispatchEvent(new Event('barticket-shift-updated'));});expect(state.contextReads.filter(auth=>auth==='Bearer SESSION_B')).toHaveLength(1);
 releaseB();await expect.poll(()=>state.contextReads.filter(auth=>auth==='Bearer SESSION_B').length).toBe(2);releaseA();await expect(page.locator('[aria-current="date"]')).toHaveAttribute('aria-label','Tuesday, November 3, 2026');await page.clock.fastForward(0);await expect(page.locator('[aria-current="date"]')).toHaveAttribute('aria-label','Tuesday, November 3, 2026');
});
test('a failed authoritative context request hides manager editing and explains why',async({page})=>{
 const state=await setup(page);await page.goto('/schedules');await expect(page.getByRole('button',{name:'+ Create',exact:true})).toBeVisible();await page.route('**/schedules/context',route=>route.fulfill({status:503,json:{detail:'Unavailable'},headers:{'Access-Control-Allow-Origin':'*'}}));
 await page.evaluate(()=>window.dispatchEvent(new Event('barticket-shift-updated')));await expect(page.getByText('Schedule date could not be verified. Editing is temporarily unavailable.',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'+ Create',exact:true})).toHaveCount(0);expect(state.writes).toEqual([]);
});
for(const locale of ['en','ja'])test(`ordinary Open, active, finished, closed, event, and past rows have semantic colors (${locale})`,async({page})=>{
 await setup(page,locale,'manager','2026-11-15T12:00:00Z',{'2026-11-15':{event_value:'Closed',schedule_type:'closed'},'2026-11-16':{event_value:'Charity night',schedule_type:'event',event_notes:'Charity night'},'2026-11-18':{event_value:'Open'},'2026-11-19':{event_value:'Community night',schedule_type:'event',event_notes:'Community night'}});await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();
 const row=day=>page.locator(`button[aria-label^="${day}:"]`), colors=await page.evaluate(()=>Object.fromEntries(['success','primary','neutral-500','danger','info'].map(token=>{const probe=document.createElement('span');probe.style.color=`var(--${token})`;document.body.append(probe);const color=getComputedStyle(probe).color;probe.remove();return [token,color];}))), label=en=>locale==='ja'?({ 'Finished shift':'終了したシフト','Active shift':'営業中のシフト','Planned shift':'シフト予定','Closed':'休業','Special event':'特別イベント','Past':'過去'}[en]):en;
 await expect(row('2026-11-01')).toContainText(label('Finished shift'));await expect(row('2026-11-02')).toContainText(label('Active shift'));await expect(row('2026-11-18')).toContainText(label('Planned shift'));await expect(row('2026-11-13')).toContainText(label('Closed'));await expect(row('2026-11-13').locator('strong')).toHaveText(label('Closed'));await expect(row('2026-11-13').locator('span')).toHaveText(locale==='ja'?'過去 · 休業':'Past · Closed');await expect(row('2026-11-19')).toContainText(label('Special event'));await expect(row('2026-11-19').locator('strong')).toHaveText('Community night');await expect(row('2026-11-14')).toContainText(label('Past'));
 await expect(row('2026-11-15')).toContainText(label('Closed'));await expect(row('2026-11-15').locator('strong')).toHaveText(label('Closed'));await expect(row('2026-11-16')).toContainText(label('Special event'));await expect(row('2026-11-16').locator('strong')).toHaveText('Charity night');
 const border=day=>row(day).evaluate(el=>getComputedStyle(el).borderLeftColor);expect(await border('2026-11-01')).toBe(colors['neutral-500']);expect(await border('2026-11-02')).toBe(colors['success']);expect(await border('2026-11-18')).toBe(colors['primary']);expect(await border('2026-11-13')).toBe(colors['neutral-500']);expect(await border('2026-11-19')).toBe(colors['info']);expect(await border('2026-11-14')).toBe(colors['neutral-500']);expect(await border('2026-11-15')).toBe(colors['danger']);expect(await border('2026-11-16')).toBe(colors['info']);
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
 const eventType = dialog.getByLabel(locale === 'ja' ? '予定の種類' : 'Schedule type', { exact: true });
 await eventType.click(); await dialog.getByRole('option',{name:locale === 'ja'?'イベント':'Event',exact:true}).click();
 const event = dialog.getByLabel(locale === 'ja' ? 'イベントのメモ' : 'Event notes', { exact: true });
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
 // Frame the complete recovery area after the Event textarea increases form height.
 await dialog.getByRole('button', { name: locale === 'ja' ? '予定を保存' : 'Save plan', exact: true }).scrollIntoViewIfNeeded();
 await expect(alert).toBeInViewport({ ratio: 1 });
 await expect(dialog.getByRole('button', { name: locale === 'ja' ? 'キャンセル' : 'Cancel', exact: true })).toBeInViewport({ ratio: 1 });
 await expect(dialog.getByRole('button', { name: locale === 'ja' ? '予定を保存' : 'Save plan', exact: true })).toBeInViewport({ ratio: 1 });
 expect(state.writes).toHaveLength(1);
 expect(state.writes[0].body.expected_revision).toBe('a'.repeat(64));
 expect(state.writes[0].body.event_value).toBe(draft);
 expect(state.writes[0].body.schedule_type).toBe('event');
 expect(state.writes[0].body.event_notes).toBe(draft);
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

const weekPanel = page => page.locator('#schedule-view-panel-week');
const rangeOf = query => {
 const params = new URLSearchParams(query);
 return { from: params.get('date_from'), to: params.get('date_to') };
};
const dateSequence = start => Array.from({ length: 7 }, (_, index) => {
 const date = new Date(`${start}T00:00:00Z`);
 date.setUTCDate(date.getUTCDate() + index);
 return date.toISOString().slice(0, 10);
});
const fullDate = (date, locale = 'en') => new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', {
 dateStyle: 'full', timeZone: 'UTC',
}).format(new Date(`${date}T00:00:00Z`));
async function expectWeek(page, start) {
 await expect(weekPanel(page)).toHaveAttribute('role', 'tabpanel');
 await expect.poll(() => weekPanel(page).locator('article[data-date]').evaluateAll(rows => rows.map(row => row.dataset.date))).toEqual(dateSequence(start));
}

for (const locale of ['en', 'ja']) for (const width of [320, 390, 768]) {
 test(`Month Week Today controls fit and retain keyboard focus ${locale} ${width}`, async ({ page }, info) => {
  const state = await setup(page, locale);
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/schedules');
  const labels = locale === 'ja' ? ['月', '週', '今日'] : ['Month', 'Week', 'Today'];
  const controls = page.getByRole('group', { name: locale === 'ja' ? '予定表示の操作' : 'Schedule controls', exact: true });
  const month = controls.getByRole('tab', { name: labels[0], exact: true });
  const week = controls.getByRole('tab', { name: labels[1], exact: true });
  const today = controls.getByRole('button', { name: labels[2], exact: true });
  await expect(controls.locator('button')).toHaveText(labels);
  await expect(controls.getByRole('tab')).toHaveCount(2);
  await expect(width <= 600 ? week : month).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Agenda|予定一覧/ })).toHaveCount(0);
  await expect(today).not.toHaveAttribute('aria-selected');
  await expect(today).not.toHaveAttribute('aria-pressed');
  await expect(week).toHaveAttribute('aria-controls', 'schedule-view-panel-week');
  expect(await controls.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const boxes = await controls.locator('button').evaluateAll(buttons => buttons.map(button => {
   const rect = button.getBoundingClientRect();
   const range = document.createRange(); range.selectNodeContents(button);
   return { left: rect.left, right: rect.right, top: rect.top, height: rect.height,
    unclipped: button.scrollWidth <= button.clientWidth, lines: new Set([...range.getClientRects()].map(r => Math.round(r.top))).size };
  }));
  expect(boxes.every(box => box.left >= 0 && box.right <= width && box.height >= 44 && box.unclipped && box.lines === 1)).toBe(true);
  expect(Math.max(...boxes.map(box => box.top)) - Math.min(...boxes.map(box => box.top))).toBeLessThan(2);
  expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left + 1);
  expect(boxes[1].right).toBeLessThanOrEqual(boxes[2].left + 1);

  await month.click(); await month.focus(); await month.press('ArrowRight');
  await expect(week).toBeFocused(); await expect(week).toHaveAttribute('aria-selected', 'true');
  await expect(week).toHaveAttribute('tabindex', '0'); await expect(month).toHaveAttribute('tabindex', '-1');
  await expectWeek(page, '2026-11-01');
  await expect.poll(() => state.reads.some(query => rangeOf(query).from === '2026-11-01' && rangeOf(query).to === '2026-11-07')).toBe(true);
  await week.press('Tab'); await expect(today).toBeFocused();
  expect(await today.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await today.press('Shift+Tab'); await expect(week).toBeFocused();
  await week.press('Home'); await expect(month).toBeFocused(); await expect(month).toHaveAttribute('aria-selected', 'true');
  await month.press('End'); await expect(week).toBeFocused(); await expect(week).toHaveAttribute('aria-selected', 'true');
  await expectWeek(page, '2026-11-01');
  await expect(weekPanel(page).getByRole('button', { name: fullDate('2026-11-02', locale), exact: true })).toHaveAttribute('aria-current', 'date');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(weekPanel(page).locator('button[aria-label^="2026-11-"]')).toHaveCount(7);
  await expect(page.getByText(locale === 'ja' ? '予定を読み込んでいます…' : 'Loading schedules…', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`audit-week-controls-${locale}-${width}.png`), fullPage: true });
  expect(state.writes).toEqual([]);

  // Match the existing Tickets-style selector, including its shared decoration.
  // The Schedule group is layout only; TabGroup owns the sole visible frame.
  const style = locator => locator.evaluate(el => {
   const css = getComputedStyle(el);
   return Object.fromEntries(['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontSize', 'fontWeight',
    'backgroundColor', 'color', 'minHeight'].map(key => [key, css[key]]));
  });
  const frame = controls.getByRole('group', { name: locale === 'ja' ? '表示方法' : 'Calendar view', exact: true });
  await expect(controls).toHaveCSS('border-top-width', '0px');
  await expect(frame).toHaveCSS('border-top-width', '1px');
  await expect(controls.locator('[data-tab-indicator]')).toHaveCount(1);
  await page.mouse.move(0, 0);
  await expect.poll(async () => {
   const indicator = await controls.locator('[data-tab-indicator]').boundingBox();
   const active = await week.boundingBox();
   return Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(indicator[key] - active[key])));
  }).toBeLessThan(0.6);
  await expect(controls.locator('[data-tab-indicator-clip]')).toHaveAttribute('aria-hidden', 'true');
  const scheduleStyle = { frame: await style(frame), active: await style(week), inactive: await style(month), action: await style(today),
   animation: await controls.locator('[data-tab-indicator]').evaluate(el => getComputedStyle(el).transition) };
  expect(scheduleStyle.action).toEqual(scheduleStyle.inactive);
  await page.goto('/tests/browser/fixtures/tab-group.html');
  if (locale === 'ja') await page.getByRole('button', { name: 'Language', exact: true }).click();
  const tickets = page.getByRole('group', { name: 'Status', exact: true });
  await page.mouse.move(0, 0);
  await expect(tickets.locator('[data-tab-indicator]')).toBeVisible();
  expect(await style(tickets)).toEqual(scheduleStyle.frame);
  expect(await style(tickets.locator('button[aria-pressed="true"]'))).toEqual(scheduleStyle.active);
  expect(await style(tickets.locator('button[aria-pressed="false"]').first())).toEqual(scheduleStyle.inactive);
  expect(await tickets.locator('[data-tab-indicator]').evaluate(el => getComputedStyle(el).transition)).toBe(scheduleStyle.animation);
  await tickets.getByRole('button').first().press('End');
  await expect(tickets.getByRole('button').last()).toBeFocused();
  await expect(tickets.getByRole('button').last()).toHaveAttribute('aria-pressed', 'true');
 });
}

for (const locale of ['en', 'ja']) test(`Week keeps empty dates and opens date-only details ${locale}`, async ({ page }) => {
 const state = await setup(page, locale, 'staff');
 state.rows = state.rows.filter(row => ['2026-11-02', '2026-11-06'].includes(row.business_date));
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto('/schedules');
 await expectWeek(page, '2026-11-01');
 const panel = weekPanel(page);
 await expect(panel.locator('button[aria-label^="2026-11-"]')).toHaveCount(2);
 await expect(panel.getByText(locale === 'ja' ? '予定なし' : 'No plan', { exact: true })).toHaveCount(5);
 await expect(panel.getByText(locale === 'ja' ? '今週の予定はありません。' : 'No scheduled shifts this week.', { exact: true })).toHaveCount(0);
 const emptyDate = panel.getByRole('button', { name: fullDate('2026-11-04', locale), exact: true });
 await emptyDate.focus(); await emptyDate.press('Enter');
 await expect(emptyDate).toHaveAttribute('aria-pressed', 'true');
 const details = page.getByRole('complementary', { name: locale === 'ja' ? '選択した日' : 'Selected day' });
 await expect(details).toContainText(locale === 'ja' ? '日付のみの予定・勤務時間の記録なし' : 'Date-only plan · hours not recorded');
 await expect(details.getByRole('button', { name: locale === 'ja' ? '予定を追加' : 'Add plan', exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: locale === 'ja' ? '詳細を閉じる' : 'Close day details', exact: true }).click();
 await expect(emptyDate).toBeFocused();
 await expectWeek(page, '2026-11-01');
 expect(state.writes).toEqual([]);
});

for (const locale of ['en', 'ja']) for (const boundary of [
 { time: '2026-11-30T12:00:00Z', start: '2026-11-29', end: '2026-12-05', next: '2026-12-06', nextEnd: '2026-12-12', month: '2026-12', monthEnd: '2026-12-31' },
 { time: '2027-01-01T12:00:00Z', start: '2026-12-27', end: '2027-01-02', next: '2027-01-03', nextEnd: '2027-01-09', month: '2027-01', monthEnd: '2027-01-31' },
 { time: '2028-02-29T12:00:00Z', start: '2028-02-27', end: '2028-03-04', next: '2028-03-05', nextEnd: '2028-03-11', month: '2028-03', monthEnd: '2028-03-31' },
]) test(`Week fetches both inclusive boundaries and advances seven days ${locale} ${boundary.start}`, async ({ page }, info) => {
 const state = await setup(page, locale, 'staff', boundary.time);
 const sample = { ...state.rows[4], actual_shift_exists: false, actual_shift_status: null, actual_shift_closed_at: null };
 state.rows = [boundary.start, boundary.end, boundary.next, boundary.nextEnd].map((date, index) => ({
  ...sample, id: 800 + index, business_date: date, event_value: `Boundary ${date}`,
 }));
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto('/schedules');
 await expectWeek(page, boundary.start);
 await expect.poll(() => rangeOf(state.reads.at(-1))).toEqual({ from: boundary.start, to: boundary.end });
 await expect(weekPanel(page).getByRole('button', { name: /^\d{4}-\d{2}-\d{2}:/ })).toHaveCount(2);
 await expect(weekPanel(page).getByRole('button', { name: new RegExp(`^${boundary.start}:`) })).toContainText(`Boundary ${boundary.start}`);
 await expect(weekPanel(page).getByRole('button', { name: new RegExp(`^${boundary.end}:`) })).toContainText(`Boundary ${boundary.end}`);
 await expect(weekPanel(page).getByText(locale === 'ja' ? '予定なし' : 'No plan', { exact: true })).toHaveCount(5);
 await expect(weekPanel(page)).not.toContainText(`Boundary ${boundary.next}`);
 const heading = page.getByRole('heading', { level: 2 });
 const originalHeading = await heading.innerText();
 expect(originalHeading).toContain(boundary.start.slice(0, 4));
 if (boundary.start.slice(0, 4) !== boundary.end.slice(0, 4)) expect(originalHeading).toContain(boundary.end.slice(0, 4));
 await expect(page.getByText(locale === 'ja' ? '予定を読み込んでいます…' : 'Loading schedules…', { exact: true })).toHaveCount(0);
 await page.screenshot({ path: info.outputPath(`audit-week-boundary-${locale}-${boundary.start}.png`), fullPage: true });
 await page.getByRole('button', { name: locale === 'ja' ? '翌週' : 'Next week', exact: true }).click();
 await expectWeek(page, boundary.next);
 await expect.poll(() => rangeOf(state.reads.at(-1))).toEqual({ from: boundary.next, to: boundary.nextEnd });
 await expect(heading).not.toHaveText(originalHeading);
 await expect(weekPanel(page).getByRole('button', { name: new RegExp(`^${boundary.next}:`) })).toBeVisible();
 await expect(weekPanel(page)).not.toContainText(`Boundary ${boundary.start}`);
 await page.evaluate(() => window.dispatchEvent(new Event('barticket-schedules-updated')));
 await expect.poll(() => state.reads.filter(query => rangeOf(query).from === boundary.next && rangeOf(query).to === boundary.nextEnd).length).toBe(2);
 // Month still requests a complete month after navigating a cross-month week.
 await page.getByRole('tab', { name: locale === 'ja' ? '月' : 'Month', exact: true }).click();
 await expect.poll(() => rangeOf(state.reads.at(-1))).toEqual({ from: `${boundary.month}-01`, to: boundary.monthEnd });
 await expect(page.getByRole('button', { name: locale === 'ja' ? '翌月' : 'Next month', exact: true })).toBeVisible();
 await page.getByRole('tab', { name: locale === 'ja' ? '週' : 'Week', exact: true }).click();
 await page.getByRole('button', { name: locale === 'ja' ? '前週' : 'Previous week', exact: true }).click();
 await expectWeek(page, boundary.start);
 expect(state.writes).toEqual([]);
});

for (const locale of ['en', 'ja']) for (const mode of ['month', 'week']) test(`Today opens operational date without changing ${mode} mode ${locale}`, async ({ page }) => {
 const state = await setup(page, locale, 'manager', '2026-11-13T12:00:00Z');
 await page.route('**/schedules/context', route => route.fulfill({ json: {
  operational_business_date: '2026-11-17', calendar_business_date: '2026-11-13', actual_shift_status: null, actual_shift_business_date: null,
 }, headers: { 'Access-Control-Allow-Origin': '*' } }));
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto('/schedules');
 const modeLabel = mode === 'month' ? (locale === 'ja' ? '月' : 'Month') : (locale === 'ja' ? '週' : 'Week');
 const tab = page.getByRole('tab', { name: modeLabel, exact: true });
 await tab.click();
 const nextLabel = mode === 'month' ? (locale === 'ja' ? '翌月' : 'Next month') : (locale === 'ja' ? '翌週' : 'Next week');
 await page.getByRole('button', { name: nextLabel, exact: true }).click();
 if (mode === 'week') await page.getByRole('button', { name: nextLabel, exact: true }).click();
 const today = page.getByRole('button', { name: locale === 'ja' ? '今日' : 'Today', exact: true });
 await today.click();
 await expect(tab).toHaveAttribute('aria-selected', 'true');
 await expect(page.locator(`#schedule-view-panel-${mode}`)).toBeVisible();
 const currentDate = page.getByRole('button', { name: fullDate('2026-11-17', locale), exact: true });
 await expect(currentDate).toHaveAttribute('aria-current', 'date');
 await expect(currentDate).toHaveAttribute('aria-pressed', 'true');
 await expect(page.getByRole('complementary')).toContainText(locale === 'ja' ? '11月17日' : 'November 17');
 await expect(page.getByRole('button', { name: locale === 'ja' ? '予定を編集' : 'Edit plan', exact: true })).toBeVisible();
 if (mode === 'week') {
  await expectWeek(page, '2026-11-15');
  await expect.poll(() => state.reads.some(query => rangeOf(query).from === '2026-11-15' && rangeOf(query).to === '2026-11-21')).toBe(true);
 }
 await page.getByRole('button', { name: locale === 'ja' ? '詳細を閉じる' : 'Close day details', exact: true }).click();
 await expect(today).toBeFocused();
 await expect(tab).toHaveAttribute('aria-selected', 'true');
 expect(state.writes).toEqual([]);
});

for (const locale of ['en', 'ja']) test(`Week date keyboard moves across month boundaries without losing focus ${locale}`, async ({ page }) => {
 const state = await setup(page, locale, 'staff', '2026-11-30T12:00:00Z');
 state.rows = [];
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto('/schedules');
 await expectWeek(page, '2026-11-29');
 const date = day => weekPanel(page).getByRole('button', { name: fullDate(day, locale), exact: true });
 await date('2026-12-05').focus(); await date('2026-12-05').press('ArrowRight');
 await expectWeek(page, '2026-12-06'); await expect(date('2026-12-06')).toBeFocused();
 await expect(date('2026-12-06')).toHaveAttribute('aria-pressed', 'true');
 await expect.poll(() => rangeOf(state.reads.at(-1))).toEqual({ from: '2026-12-06', to: '2026-12-12' });
 await date('2026-12-06').press('End'); await expect(date('2026-12-12')).toBeFocused();
 await date('2026-12-12').press('Home'); await expect(date('2026-12-06')).toBeFocused();
 await date('2026-12-06').press('ArrowLeft');
 await expectWeek(page, '2026-11-29'); await expect(date('2026-12-05')).toBeFocused();
 await expect(page.getByRole('complementary')).toHaveCount(0);
 expect(state.writes).toEqual([]);
});

test('late previous-week read cannot replace latest week and sign-out clears plans', async ({ page }) => {
 const state = await setup(page);
 await page.setViewportSize({ width: 390, height: 844 });
 await page.goto('/schedules');
 await expectWeek(page, '2026-11-01');
 await expect(weekPanel(page).locator('button[aria-label^="2026-11-02:"]')).toBeVisible();
 let release, oldReadStarted = false;
 const held = new Promise(resolve => { release = resolve; });
 await page.route('**/schedules?date_from=2026-11-01&date_to=2026-11-07', async route => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS' } });
  oldReadStarted = true; await held;
  await route.fulfill({ json: [{ ...state.rows[1], manager: { name: 'STALE_WEEK_RESPONSE', user_id: null } }], headers: { 'Access-Control-Allow-Origin': '*' } });
 });
 await page.evaluate(() => window.dispatchEvent(new Event('barticket-schedules-updated')));
 await expect.poll(() => oldReadStarted).toBe(true);
 await page.getByRole('button', { name: 'Next week', exact: true }).click();
 await expectWeek(page, '2026-11-08');
 await expect(weekPanel(page).locator('button[aria-label^="2026-11-09:"]')).toBeVisible();
 const oldResponse = page.waitForResponse(response => response.request().method() === 'GET' && response.url().includes('date_from=2026-11-01&date_to=2026-11-07'));
 release(); await oldResponse;
 await expect(weekPanel(page).locator('button[aria-label^="2026-11-09:"]')).toBeVisible();
 await expect(page.getByText('STALE_WEEK_RESPONSE')).toHaveCount(0);
 await page.evaluate(() => { localStorage.removeItem('barticket_token'); window.dispatchEvent(new Event('barticket-auth')); });
 await expect(weekPanel(page).locator('button[aria-label^="2026-11-"]')).toHaveCount(0);
 await expect(page.getByText('Haruka')).toHaveCount(0);
 await expect(page.getByRole('button', { name: '+ Create', exact: true })).toHaveCount(0);
 expect(state.writes).toEqual([]);
});


const scheduleColorPalettes = {
 active: { border: 'success', color: 'success-300', surface: 'success-900' },
 planned: { border: 'primary', color: 'royal-300', surface: 'royal-900' },
 event: { border: 'info', color: 'info-300', surface: 'info-900' },
 closed: { border: 'danger', color: 'danger-300', surface: 'danger-900' },
 finished: { border: 'neutral-500', color: 'neutral-300', surface: 'neutral-900' },
 past: { border: 'neutral-500', color: 'neutral-300', surface: 'neutral-900' },
};
const scheduleColorMatrices = [
 { name: 'current', start: '2026-11-15', end: '2026-11-21', cases: [
  { date: '2026-11-15', state: 'finished', en: 'Finished shift', ja: '終了したシフト',
   row: { actual_shift_exists: true, actual_shift_status: 'closed', actual_shift_closed_at: '2026-11-15T16:00:00Z', event_value: 'Finished event', schedule_type: 'event' } },
  { date: '2026-11-16', state: 'past', en: 'Past', ja: '過去', row: { event_value: 'Past event', schedule_type: 'event' } },
  { date: '2026-11-17', state: 'active', en: 'Active shift', ja: '営業中のシフト', row: { actual_shift_exists: true, actual_shift_status: 'open' } },
  { date: '2026-11-18', state: 'planned', en: 'Planned shift', ja: 'シフト予定', row: {} },
  { date: '2026-11-19', state: 'event', en: 'Special event', ja: '特別イベント', row: { event_value: 'Live music', schedule_type: 'event', event_notes: 'Live music' } },
  { date: '2026-11-20', state: 'closed', en: 'Closed', ja: '休業', row: { event_value: 'Closed', schedule_type: 'closed' } },
  { date: '2026-11-21', state: 'closed', en: 'Closed · Weather closure', ja: '休業 · Weather closure', row: { venue_status: 'closed', venue_event: 'Weather closure' } },
 ] },
 { name: 'past-and-overnight', start: '2026-11-08', end: '2026-11-14', cases: [
  { date: '2026-11-08', state: 'past', en: 'Past', ja: '過去', row: {} },
  { date: '2026-11-09', state: 'past', en: 'Past · Closed', ja: '過去 · 休業', row: { event_value: 'Closed', schedule_type: undefined } },
  { date: '2026-11-10', state: 'past', en: 'Past · Closed', ja: '過去 · 休業', row: { event_value: 'Closed', schedule_type: 'closed' } },
  { date: '2026-11-11', state: 'past', en: 'Past · Closed', ja: '過去 · 休業', row: { venue_status: 'closed', venue_event: 'Past weather closure' } },
  { date: '2026-11-12', state: 'past', en: 'Past', ja: '過去', row: { event_value: 'Past live music', schedule_type: 'event' } },
  { date: '2026-11-13', state: 'active', en: 'Active shift', ja: '営業中のシフト', row: { schedule_state: 'past', actual_shift_exists: true, actual_shift_status: 'open' } },
  { date: '2026-11-14', state: 'finished', en: 'Finished shift', ja: '終了したシフト',
   row: { schedule_state: 'past', actual_shift_exists: true, actual_shift_status: 'closed', actual_shift_closed_at: '2026-11-14T16:00:00Z', event_value: 'Finished live music', schedule_type: 'event' } },
 ] },
];
for (const locale of ['en', 'ja']) for (const mode of ['month', 'week']) for (const matrix of scheduleColorMatrices) {
 test(`Schedule state colors agree across ${mode} and Details ${locale} ${matrix.name}`, async ({ page }, info) => {
  const state = await setup(page, locale, 'staff', '2026-11-17T12:00:00Z');
  if (matrix.name === 'past-and-overnight') await page.route('**/schedules/context', route => route.fulfill({ json: {
   operational_business_date: '2026-11-13', calendar_business_date: '2026-11-17', actual_shift_status: 'open', actual_shift_business_date: '2026-11-13',
  }, headers: { 'Access-Control-Allow-Origin': '*' } }));
  const sample = { ...state.rows[4], schedule_state: 'upcoming', event_value: 'Open', schedule_type: 'open', event_notes: null,
   actual_shift_exists: false, actual_shift_status: null, actual_shift_closed_at: null, venue_status: null, venue_event: null };
  state.rows = matrix.cases.map((item, index) => ({ ...sample, ...item.row, id: 950 + index, business_date: item.date }));
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/schedules');
  const viewName = mode === 'month' ? (locale === 'ja' ? '月' : 'Month') : (locale === 'ja' ? '週' : 'Week');
  await page.getByRole('tab', { name: viewName, exact: true }).click();
  if (mode === 'week' && matrix.name === 'past-and-overnight') await page.getByRole('button', { name: locale === 'ja' ? '前週' : 'Previous week', exact: true }).click();
  const panel = page.locator(`#schedule-view-panel-${mode}`);
  const expectedRange = mode === 'month' ? { from: '2026-11-01', to: '2026-11-30' } : { from: matrix.start, to: matrix.end };
  await expect.poll(() => state.reads.some(query => rangeOf(query).from === expectedRange.from && rangeOf(query).to === expectedRange.to)).toBe(true);
  await expect(page.getByText(locale === 'ja' ? '予定を読み込んでいます…' : 'Loading schedules…', { exact: true })).toHaveCount(0);
  await expect(panel.locator('button[aria-label^="2026-11-"]')).toHaveCount(7);
  if (mode === 'week') await expectWeek(page, matrix.start);
  const colors = await page.evaluate(tokens => Object.fromEntries(tokens.map(token => {
   const probe = document.createElement('span'); probe.style.color = `var(--${token})`; document.body.append(probe);
   const color = getComputedStyle(probe).color; probe.remove(); return [token, color];
  })), [...new Set(Object.values(scheduleColorPalettes).flatMap(palette => Object.values(palette)))]);
  if (matrix.name === 'current') {
   // Blue is an ordinary shift; red keeps the existing Closed label.
   await expect(panel.locator('button[aria-label^="2026-11-18:"] strong')).toHaveText('Open');
   await expect(panel.locator('button[aria-label^="2026-11-20:"] strong')).toHaveText(locale === 'ja' ? '休業' : 'Closed');
  } else {
   await expect(panel.getByRole('button', { name: fullDate('2026-11-13', locale), exact: true })).toHaveAttribute('aria-current', 'date');
   await expect(panel.locator('button[aria-label^="2026-11-11:"] strong')).toHaveText(locale === 'ja' ? '休業' : 'Closed');
  }
  for (const item of matrix.cases) {
   const palette = scheduleColorPalettes[item.state];
   const event = panel.getByRole('button', { name: new RegExp(`^${item.date}:`) });
   const label = event.locator(mode === 'month' ? ':scope > span' : ':scope > small');
   await expect(label).toHaveText(item[locale]);
   await expect(event).toHaveCSS('border-left-color', colors[palette.border]);
   await expect(event).toHaveCSS('border-left-width', '3px');
   await expect(event).toHaveCSS('background-color', colors[palette.surface]);
   await expect(label).toHaveCSS('color', colors[palette.color]);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath(`audit-week-colors-${mode}-${locale}-${matrix.name}.png`), fullPage: true });
  for (const item of matrix.cases) {
   const palette = scheduleColorPalettes[item.state];
   const event = panel.getByRole('button', { name: new RegExp(`^${item.date}:`) });
   await event.click();
   const details = page.getByRole('complementary', { name: locale === 'ja' ? '選択した日' : 'Selected day', exact: true });
   const status = details.locator(':scope > p').filter({ hasText: new RegExp(`^${item[locale]}$`) });
   await expect(status).toHaveText(item[locale]);
   await expect(status).toHaveCSS('color', colors[palette.color]);
   await expect(status).toHaveCSS('border-left-color', colors[palette.border]);
   await expect(status).toHaveCSS('border-left-width', '3px');
   await expect(status).toHaveCSS('background-color', colors[palette.surface]);
   await expect(details).toContainText(locale === 'ja' ? '日付のみの予定・勤務時間の記録なし' : 'Date-only plan · hours not recorded');
   await expect(page.getByRole('tab', { name: viewName, exact: true })).toHaveAttribute('aria-selected', 'true');
   await expect(event).toHaveCSS('border-left-color', colors[palette.border]);
   if (item.state === 'active') await details.screenshot({ path: info.outputPath(`audit-week-colors-${mode}-${locale}-${matrix.name}-details.png`) });
   await details.getByRole('button', { name: locale === 'ja' ? '詳細を閉じる' : 'Close day details', exact: true }).click();
   await expect(event).toBeFocused();
  }
  expect(state.writes).toEqual([]);
 });
}
