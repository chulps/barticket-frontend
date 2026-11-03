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

for (const locale of ['en', 'ja']) for (const width of [320, 390, 768]) {
 test(`Schedule view tabs fill available width ${locale} ${width}`, async ({ page }, info) => {
  const state = await setup(page, locale, 'staff');
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/schedules');
  const controls = page.getByRole('group', { name: locale === 'ja' ? '予定表示の操作' : 'Schedule controls', exact: true });
  const frame = controls.getByRole('tablist');
  const labels = locale === 'ja' ? ['月', '週', '日'] : ['Month', 'Week', 'Day'];
  await expect(frame.getByRole('tab')).toHaveText(labels);
  const layout = await controls.evaluate(element => {
   const rect = element.getBoundingClientRect(), toolbar = element.parentElement.getBoundingClientRect();
   const frame = element.querySelector('[role=tablist]').getBoundingClientRect();
   const tabs = [...element.querySelectorAll('[role=tab]')].map(tab => {
    const box = tab.getBoundingClientRect(); return { width: box.width, height: box.height, clipped: tab.scrollWidth > tab.clientWidth };
   });
   return { left: rect.left, right: rect.right, width: rect.width, toolbarWidth: toolbar.width, toolbarLeft: toolbar.left, frameWidth: frame.width, tabs };
  });
  expect(Math.abs(layout.width - layout.toolbarWidth)).toBeLessThan(1);
  expect(Math.abs(layout.left - layout.toolbarLeft)).toBeLessThan(1);
  expect(Math.abs(layout.frameWidth - layout.width)).toBeLessThan(1);
  expect(Math.max(...layout.tabs.map(tab => tab.width)) - Math.min(...layout.tabs.map(tab => tab.width))).toBeLessThan(1);
  expect(layout.tabs.every(tab => tab.height >= 44 && !tab.clipped)).toBe(true);
  expect(layout.left).toBeGreaterThanOrEqual(0); expect(layout.right).toBeLessThanOrEqual(width);
  await frame.getByRole('tab', { name: labels[0], exact: true }).click();
  await frame.getByRole('tab', { name: labels[0], exact: true }).press('End');
  const day = frame.getByRole('tab', { name: labels[2], exact: true });
  await expect(day).toBeFocused(); await expect(day).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#schedule-view-panel-day article[data-date]')).toHaveCount(1);
  await expect(page.getByText(locale === 'ja' ? '予定を読み込んでいます…' : 'Loading schedules…', { exact: true })).toHaveCount(0);
  await expect(frame.locator('[data-tab-indicator]')).toHaveCount(1);
  await expect.poll(async () => {
   const indicator = await frame.locator('[data-tab-indicator]').boundingBox(), active = await day.boundingBox();
   return Math.max(...['x', 'y', 'width', 'height'].map(key => Math.abs(indicator[key] - active[key])));
  }).toBeLessThan(0.6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  expect(state.writes).toEqual([]);
  await page.screenshot({ path: info.outputPath(`audit-width-${locale}-${width}.png`), fullPage: true });
 });
}
