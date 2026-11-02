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
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('http://127.0.0.1:8765/**',async r=>{const q=r.request(),u=new URL(q.url());const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS'};if(q.method()==='OPTIONS')return r.fulfill({status:204,headers});let body=[],status=200;
 if(q.method()!=='GET'){state.writes.push({path:u.pathname,body:q.postDataJSON()});if(state.conflict){status=409;body={detail:'Concurrent change'};}else body={...rows[1],...q.postDataJSON()};}
 else if(u.pathname==='/auth/me')body=role==='manager'?manager:staff;else if(u.pathname==='/users')body=[manager,staff];else if(u.pathname==='/schedules/context'){state.contextReads.push(q.headers()['authorization']??'');const now=new Date(await page.evaluate(()=>Date.now()));const tokyoDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo'}).format(now);const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hour:'2-digit',hourCycle:'h23'}).format(now));const parts=tokyoDate.split('-').map(Number);const calendar=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]-(hour<12?1:0))).toISOString().slice(0,10);body={operational_business_date:calendar,calendar_business_date:calendar,actual_shift_status:null,actual_shift_business_date:null};}else if(u.pathname==='/schedules'){state.reads.push(u.search);body=u.search.includes('2026-11')?rows.map(row=>({...row,revision:state.revision})):[];}else if(u.pathname==='/auth/status')body={has_accounts:true,google_enabled:false};else if(u.pathname==='/shifts/current')body=null;else if(u.pathname==='/menu')body={items:[],coverCharge:500};else if(u.pathname==='/notices')body={notices:[]};
 await r.fulfill({status,json:body,headers});});return state;
}
async function selectScheduleType(page, value, locale='en') {
 const labels=locale==='ja'?{open:'営業',event:'イベント',closed:'休業'}:{open:'Open',event:'Event',closed:'Closed'};
 const combo=page.getByRole('combobox',{name:locale==='ja'?'予定の種類':'Schedule type',exact:true});await combo.click();await page.getByRole('option',{name:labels[value],exact:true}).click();await expect(combo).toHaveAttribute('data-select-value',value);
}
for(const locale of ['en','ja'])for(const width of [320,390,768,1280])test(`calendar pixels ${locale} ${width}`,async({page},info)=>{
 await setup(page,locale);await page.setViewportSize({width,height:900});await page.goto('/schedules');await expect(page.getByRole('heading',{name:locale==='ja'?'シフト予定':'Schedule',exact:true})).toBeVisible();await expect(page.getByText('Haruka').first()).toBeVisible();
 const subtitle=page.getByText(locale==='ja'?'勤務予定（打刻記録とは別）':'Plans, not clock-in records',{exact:true}),controls=page.getByRole('group',{name:locale==='ja'?'予定表示の操作':'Schedule controls',exact:true}),subtitleBox=await subtitle.boundingBox(),controlsBox=await controls.boundingBox();expect(subtitleBox.width).toBeGreaterThan(200);if(width<=600)expect(controlsBox.y).toBeGreaterThanOrEqual(subtitleBox.y+subtitleBox.height);
 await page.getByRole('tab',{name:locale==='ja'?'予定一覧':'Agenda',exact:true}).click();await page.screenshot({path:info.outputPath('agenda.png'),fullPage:true});
 await page.getByRole('tab',{name:locale==='ja'?'月':'Month',exact:true}).click();const monthTitle=page.getByRole('button',{name:locale==='ja'?'月間カレンダーを表示':'Show month calendar',exact:true});await expect(monthTitle).toBeVisible();expect(await monthTitle.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);expect(Number.parseFloat(await monthTitle.evaluate(el=>getComputedStyle(el).fontSize))).toBeLessThanOrEqual(18);await page.screenshot({path:info.outputPath('calendar.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 const today=page.getByRole('button',{name:locale==='ja'?'今日':'Today',exact:true});await today.click();const detailClose=page.getByRole('button',{name:locale==='ja'?'詳細を閉じる':'Close day details',exact:true}),detailBounds=await detailClose.boundingBox();expect(detailBounds.width).toBe(44);expect(detailBounds.height).toBe(44);expect(await detailClose.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');await detailClose.evaluate(el=>el.focus({focusVisible:true}));expect(await detailClose.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');await page.screenshot({path:info.outputPath('day-details.png'),fullPage:true});await detailClose.press('Enter');await expect(page.getByRole('complementary',{name:locale==='ja'?'選択した日':'Selected day'})).toHaveCount(0);await expect(today).toBeFocused();
 await today.click();await page.getByRole('button',{name:locale==='ja'?'予定を編集':'Edit plan',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.screenshot({path:info.outputPath('editor.png'),fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 await selectScheduleType(page,'event',locale);const eventNotes=page.getByLabel(locale==='ja'?'イベントのメモ':'Event notes',{exact:true});await expect(eventNotes).toBeVisible();const notesBounds=await eventNotes.boundingBox();expect(notesBounds.x).toBeGreaterThanOrEqual(0);expect(notesBounds.x+notesBounds.width).toBeLessThanOrEqual(width);await page.screenshot({path:info.outputPath('editor-event-notes.png'),fullPage:true});
 const managerSelect=page.getByRole('combobox',{name:locale==='ja'?'マネージャー':'Manager',exact:true});await managerSelect.click();const listbox=page.getByRole('listbox');await expect(listbox).toBeVisible();
 await expect(listbox).toHaveCSS('opacity','1');await expect.poll(()=>listbox.evaluate(el=>getComputedStyle(el).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
 await managerSelect.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{}))));
 expect(await listbox.evaluate(el=>{const background=getComputedStyle(el).backgroundColor;return {inDialog:!!el.closest('dialog'),opaque:!background.startsWith('rgba(')||background.endsWith(', 1)'),animating:el.getAnimations({subtree:true}).some(a=>a.playState==='running'||a.pending),uncovered:[...el.querySelectorAll('[role=option]')].every(option=>{const r=option.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})};})).toEqual({inDialog:true,opaque:true,animating:false,uncovered:true});
 await page.screenshot({path:info.outputPath('editor-manager-menu.png'),fullPage:true});await managerSelect.press('Escape');await expect(page.getByRole('listbox')).toHaveCount(0);await expect(managerSelect).toBeFocused();
});
for(const locale of ['en','ja'])test(`schedule type options and event notes survive switching (${locale})`,async({page})=>{
 const state=await setup(page,locale);await page.goto('/schedules');await page.getByRole('button',{name:locale==='ja'?'+ 作成':'+ Create',exact:true}).click();
 const type=page.getByLabel(locale==='ja'?'予定の種類':'Schedule type',{exact:true}),notesLabel=locale==='ja'?'イベントのメモ':'Event notes';
 await expect(type.locator('option')).toHaveText(locale==='ja'?['営業','イベント','休業']:['Open','Event','Closed']);await expect(type).toHaveAttribute('data-select-value','open');await expect(page.getByLabel(notesLabel,{exact:true})).toHaveCount(0);
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
 const state=await setup(page,locale,'manager','2026-11-15T12:00:00Z',{'2026-11-15':{event_value:'Closed',schedule_type:'closed'},'2026-11-16':{event_value:'Charity night',schedule_type:'event',event_notes:'Charity night'},'2026-11-18':{event_value:'Open'},'2026-11-19':{event_value:'Community night',schedule_type:'event',event_notes:'Community night'}});await page.goto('/schedules');await expect(page.getByText('Haruka').first()).toBeVisible();
 const row=day=>page.locator(`button[aria-label^="${day}:"]`), colors=await page.evaluate(()=>Object.fromEntries(['success-400','neutral-500','danger-400','event-400'].map(token=>[token,getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim()]))), label=en=>locale==='ja'?({ 'Finished shift':'終了したシフト','Active shift':'営業中のシフト','Planned shift':'シフト予定','Closed':'休業','Special event':'特別イベント','Past':'過去'}[en]):en;
 await expect(row('2026-11-01')).toContainText(label('Finished shift'));await expect(row('2026-11-02')).toContainText(label('Active shift'));await expect(row('2026-11-18')).toContainText(label('Planned shift'));await expect(row('2026-11-13')).toContainText(label('Closed'));await expect(row('2026-11-13').locator('strong')).toHaveText(label('Closed'));await expect(row('2026-11-19')).toContainText(label('Special event'));await expect(row('2026-11-19').locator('strong')).toHaveText('Community night');await expect(row('2026-11-14')).toContainText(label('Past'));
 await expect(row('2026-11-15')).toContainText(label('Closed'));await expect(row('2026-11-15').locator('strong')).toHaveText(label('Closed'));await expect(row('2026-11-16')).toContainText(label('Special event'));await expect(row('2026-11-16').locator('strong')).toHaveText('Charity night');
 const border=day=>row(day).evaluate(el=>getComputedStyle(el).borderLeftColor);expect(await border('2026-11-01')).toBe(colors['neutral-500']);expect(await border('2026-11-02')).toBe(colors['success-400']);expect(await border('2026-11-18')).toBe(colors['neutral-500']);expect(await border('2026-11-13')).toBe(colors['danger-400']);expect(await border('2026-11-19')).toBe(colors['event-400']);expect(await border('2026-11-14')).toBe(colors['neutral-500']);expect(await border('2026-11-15')).toBe(colors['danger-400']);expect(await border('2026-11-16')).toBe(colors['event-400']);
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
 await alert.scrollIntoViewIfNeeded();
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
