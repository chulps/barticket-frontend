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

const dayPanel = page => page.locator('#schedule-view-panel-day');
const tab = (page, mode, locale = 'en') => page.getByRole('tab', { name: (locale === 'ja' ? { month: '月', week: '週', day: '日' } : { month: 'Month', week: 'Week', day: 'Day' })[mode], exact: true });
const fullDate = (date, locale = 'en') => new Intl.DateTimeFormat(locale === 'ja' ? 'ja-JP' : 'en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const rangeOf = query => { const p = new URLSearchParams(query); return { from: p.get('date_from'), to: p.get('date_to') }; };
const context = (operational = '2026-11-17', calendar = '2026-11-13') => ({ operational_business_date: operational, calendar_business_date: calendar, actual_shift_status: null, actual_shift_business_date: null });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,OPTIONS' };
async function mockContext(page, body) {
 await page.route('**/schedules/context', route => route.fulfill({ json: body, headers: cors }));
}
async function expectDay(page, date) {
 await expect(dayPanel(page)).toHaveAttribute('role', 'tabpanel');
 await expect(dayPanel(page)).toHaveAttribute('aria-labelledby', 'schedule-view-tab-day');
 await expect(dayPanel(page).locator('article[data-date]')).toHaveCount(1);
 await expect(dayPanel(page).locator('article[data-date]')).toHaveAttribute('data-date', date);
}
async function exactRead(state, date) {
 await expect.poll(() => state.reads.some(query => rangeOf(query).from === date && rangeOf(query).to === date)).toBe(true);
}
const next = (page, locale = 'en') => page.getByRole('button', { name: locale === 'ja' ? '翌日' : 'Next day', exact: true });
const previous = (page, locale = 'en') => page.getByRole('button', { name: locale === 'ja' ? '前日' : 'Previous day', exact: true });

for (const locale of ['en', 'ja']) for (const width of [320, 390, 768]) test(`Day shows one operational date, real tabs and Tickets styling ${locale} ${width}`, async ({ page }, info) => {
 const state = await setup(page, locale, 'manager', '2026-11-13T12:00:00Z');
 await mockContext(page, context());
 await page.setViewportSize({ width, height: 900 });
 await page.goto('/schedules');
 await tab(page, 'month', locale).click();
 await expect(page.locator('[aria-current="date"]')).toHaveAttribute('aria-label', fullDate('2026-11-17', locale));
 const frame = page.getByRole('tablist', { name: locale === 'ja' ? '表示方法' : 'Calendar view', exact: true });
 await expect(frame.getByRole('tab')).toHaveText(locale === 'ja' ? ['月', '週', '日'] : ['Month', 'Week', 'Day']);
 await expect(page.getByRole('button', { name: locale === 'ja' ? '今日' : 'Today', exact: true })).toHaveCount(0);
 await tab(page, 'month', locale).click();
 await tab(page, 'month', locale).press('ArrowRight'); await expect(tab(page, 'week', locale)).toBeFocused();
 await tab(page, 'week', locale).press('ArrowRight'); await expect(tab(page, 'day', locale)).toBeFocused();
 await expectDay(page, '2026-11-17'); await exactRead(state, '2026-11-17');
 await expect(tab(page, 'day', locale)).toHaveAttribute('id', 'schedule-view-tab-day');
 await expect(tab(page, 'day', locale)).toHaveAttribute('aria-controls', 'schedule-view-panel-day');
 await expect(tab(page, 'day', locale)).toHaveAttribute('aria-selected', 'true');
 await expect(frame.locator('[role=tab][tabindex="0"]')).toHaveCount(1);
 await expect(page.getByRole('complementary')).toHaveCount(0);
 await expect(dayPanel(page)).toContainText(locale === 'ja' ? '日付のみの予定・勤務時間の記録なし' : 'Date-only plans · hours not recorded');
 await expect(dayPanel(page).getByRole('button', { name: /^2026-11-17:/ })).toBeVisible();
 await expect(dayPanel(page)).not.toContainText('2026-11-18');
 await tab(page, 'day', locale).press('ArrowRight'); await expect(tab(page, 'month', locale)).toBeFocused();
 await tab(page, 'month', locale).press('ArrowLeft'); await expect(tab(page, 'day', locale)).toBeFocused();
 await tab(page, 'day', locale).press('Home'); await expect(tab(page, 'month', locale)).toBeFocused();
 await tab(page, 'month', locale).press('End'); await expect(tab(page, 'day', locale)).toBeFocused();
 await expectDay(page, '2026-11-17');
 await expect(page.getByText(locale === 'ja' ? '予定を読み込んでいます…' : 'Loading schedules…', { exact: true })).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 expect(await frame.getByRole('tab').evaluateAll(buttons => buttons.every(button => {
  const r = button.getBoundingClientRect(); return r.height >= 44 && r.left >= 0 && r.right <= innerWidth && button.scrollWidth <= button.clientWidth;
 }))).toBe(true);
 await page.screenshot({ path: info.outputPath(`audit-day-plan-${locale}-${width}.png`), fullPage: true });
 const event = dayPanel(page).getByRole('button', { name: /^2026-11-17:/ });
 await event.click();
 await expect(page.getByRole('complementary')).toContainText(locale === 'ja' ? '11月17日' : 'November 17');
 await page.screenshot({ path: info.outputPath(`audit-day-details-${locale}-${width}.png`), fullPage: true });
 await page.getByRole('button', { name: locale === 'ja' ? '詳細を閉じる' : 'Close day details', exact: true }).click();
 await expect(event).toBeFocused();
 const style = locator => locator.evaluate(el => { const css = getComputedStyle(el); return Object.fromEntries(['borderTopWidth', 'borderTopStyle', 'borderTopColor', 'borderRadius', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontSize', 'fontWeight', 'backgroundColor', 'color', 'minHeight'].map(key => [key, css[key]])); });
 await page.mouse.move(0, 0); await page.clock.runFor(300);
 const styles = { frame: Object.fromEntries(Object.entries(await style(frame)).filter(([key]) => key !== 'color')), active: await style(tab(page, 'day', locale)), inactive: await style(tab(page, 'month', locale)) };
 await expect(frame.locator('[data-tab-indicator]')).toHaveCount(1);
 await expect.poll(async () => { const a = await frame.locator('[data-tab-indicator]').boundingBox(), b = await tab(page, 'day', locale).boundingBox(); return Math.max(...['x','y','width','height'].map(key => Math.abs(a[key] - b[key]))); }).toBeLessThan(0.6);
 await page.goto('/tests/browser/fixtures/tab-group.html');
 if (locale === 'ja') await page.getByRole('button', { name: 'Language', exact: true }).click();
 const tickets = page.getByRole('group', { name: 'Status', exact: true });
 await page.mouse.move(0, 0); await page.clock.runFor(300);
 expect(Object.fromEntries(Object.entries(await style(tickets)).filter(([key]) => key !== 'color'))).toEqual(styles.frame);
 expect(await style(tickets.locator('button[aria-pressed="true"]'))).toEqual(styles.active);
 expect(await style(tickets.locator('button[aria-pressed="false"]').first())).toEqual(styles.inactive);
 expect(state.writes).toEqual([]);
});

for (const locale of ['en', 'ja']) test(`Day selection closes details and Month/Week retain selected date ${locale}`, async ({ page }) => {
 const state = await setup(page, locale, 'manager', '2026-11-13T12:00:00Z'); await mockContext(page, context());
 await page.goto('/schedules'); await tab(page, 'month', locale).click();
 await page.getByRole('button', { name: fullDate('2026-11-14', locale), exact: true }).click();
 await expect(page.getByRole('complementary')).toBeVisible();
 await tab(page, 'day', locale).click(); await expectDay(page, '2026-11-17');
 await expect(page.getByRole('complementary')).toHaveCount(0); await exactRead(state, '2026-11-17');
 await next(page, locale).click(); await expectDay(page, '2026-11-18'); await exactRead(state, '2026-11-18');
 await tab(page, 'week', locale).click();
 await expect(page.locator('#schedule-view-panel-week article[data-date]')).toHaveCount(7);
 await expect(page.getByRole('button', { name: fullDate('2026-11-18', locale), exact: true })).toHaveAttribute('aria-pressed', 'true');
 await expect.poll(() => rangeOf(state.reads.at(-1))).toEqual({ from: '2026-11-15', to: '2026-11-21' });
 await tab(page, 'month', locale).click();
 await expect(page.getByRole('button', { name: fullDate('2026-11-18', locale), exact: true })).toHaveAttribute('aria-pressed', 'true');
 await expect.poll(() => state.reads.some(query => rangeOf(query).from === '2026-11-01' && rangeOf(query).to === '2026-11-30')).toBe(true);
 await tab(page, 'day', locale).click(); await expectDay(page, '2026-11-17');
 expect(state.writes).toEqual([]);
});

for (const intervention of ['none', 'navigate', 'select', 'keyboard', 'view']) test(`Day late context respects ${intervention} intervention`, async ({ page }) => {
 const state = await setup(page, 'en', 'staff', '2026-11-13T12:00:00Z');
 let release, started = false; const held = new Promise(resolve => { release = resolve; });
 await page.route('**/schedules/context', async route => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  started = true; await held; await route.fulfill({ json: context(), headers: cors });
 });
 await page.goto('/schedules'); await expect.poll(() => started).toBe(true);
 await tab(page, 'day').click(); await expectDay(page, '2026-11-13');
 await expect(page.getByRole('complementary')).toHaveCount(0);
 if (intervention === 'navigate') await next(page).click();
 if (intervention === 'select') await dayPanel(page).getByRole('button', { name: fullDate('2026-11-13'), exact: true }).click();
 if (intervention === 'keyboard') await dayPanel(page).getByRole('button', { name: fullDate('2026-11-13'), exact: true }).press('ArrowRight');
 if (intervention === 'view') await tab(page, 'month').click();
 const response = page.waitForResponse(r => r.url().endsWith('/schedules/context') && r.request().method() === 'GET');
 release(); await response;
 // Wait for the authoritative date marker to prove context has been consumed, including when the viewed day differs.
 if (intervention === 'view') {
  await expect(page.locator('[aria-current="date"]')).toHaveAttribute('aria-label', fullDate('2026-11-17'));
  await expect(tab(page, 'month')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: fullDate('2026-11-13'), exact: true })).toHaveAttribute('aria-pressed', 'true');
 } else {
  const date = intervention === 'none' ? '2026-11-17' : ['navigate', 'keyboard'].includes(intervention) ? '2026-11-14' : '2026-11-13';
  if (intervention === 'none') await expect(dayPanel(page).locator('[aria-current="date"]')).toHaveAttribute('aria-label', fullDate(date));
  else await expect(dayPanel(page).locator('[aria-current="date"]')).toHaveCount(0);
  await expectDay(page, date); await exactRead(state, date);
  await expect(page.getByRole('complementary')).toHaveCount(intervention === 'select' ? 1 : 0);
 }
 expect(state.writes).toEqual([]);
});

for (const locale of ['en', 'ja']) for (const [date, before, after] of [
 ['2026-11-30', '2026-11-29', '2026-12-01'], ['2026-12-31', '2026-12-30', '2027-01-01'],
 ['2028-02-29', '2028-02-28', '2028-03-01'], ['2027-03-01', '2027-02-28', '2027-03-02'],
]) test(`Day advances exactly one date across boundaries ${locale} ${date}`, async ({ page }) => {
 const state = await setup(page, locale, 'staff', `${date}T12:00:00Z`); state.rows = [];
 await page.goto('/schedules'); await tab(page, 'day', locale).click(); await expectDay(page, date); await exactRead(state, date);
 const start = state.reads.length;
 await next(page, locale).click(); await expectDay(page, after); await exactRead(state, after);
 await previous(page, locale).click(); await expectDay(page, date); await exactRead(state, date);
 await previous(page, locale).click(); await expectDay(page, before); await exactRead(state, before);
 expect(state.reads.slice(start).map(rangeOf)).toEqual([after, before].map(day => ({ from: day, to: day })));
 // Returning to a cached date must preserve its selection; Month and Week still request complete ranges.
 await tab(page, 'week', locale).click();
 const d = new Date(`${before}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
 const from = d.toISOString().slice(0, 10); d.setUTCDate(d.getUTCDate() + 6); const to = d.toISOString().slice(0, 10);
 await expect(page.locator('#schedule-view-panel-week article[data-date]')).toHaveCount(7);
 await expect.poll(() => state.reads.some(query => rangeOf(query).from === from && rangeOf(query).to === to)).toBe(true);
 await tab(page, 'month', locale).click();
 const month = before.slice(0, 7), end = new Date(Date.UTC(Number(before.slice(0, 4)), Number(before.slice(5, 7)), 0)).toISOString().slice(0, 10);
 await expect.poll(() => state.reads.some(query => rangeOf(query).from === `${month}-01` && rangeOf(query).to === end)).toBe(true);
 await expect(page.getByRole('complementary')).toHaveCount(0); expect(state.writes).toEqual([]);
});

for (const locale of ['en', 'ja']) for (const width of [320, 390, 768]) test(`Day empty staff plan is readable without edit actions ${locale} ${width}`, async ({ page }, info) => {
 const state = await setup(page, locale, 'staff'); state.rows = [];
 await page.setViewportSize({ width, height: 900 }); await page.goto('/schedules'); await tab(page, 'day', locale).click();
 await expectDay(page, '2026-11-02'); await exactRead(state, '2026-11-02');
 const empty = dayPanel(page).getByRole('button', { name: `${fullDate('2026-11-02', locale)}: ${locale === 'ja' ? '予定なし' : 'No plan'}`, exact: true });
 await expect(empty).toHaveText(locale === 'ja' ? '予定なし' : 'No plan');
 await expect(page.getByRole('complementary')).toHaveCount(0);
 await page.screenshot({ path: info.outputPath(`audit-day-empty-${locale}-${width}.png`), fullPage: true });
 await empty.click(); await expect(page.getByRole('complementary')).toContainText(locale === 'ja' ? '日付のみの予定・勤務時間の記録なし' : 'Date-only plan · hours not recorded');
 await expect(page.getByRole('button', { name: /^(Edit plan|Add plan|\+ Create|予定を編集|予定を追加|＋ 作成)$/ })).toHaveCount(0);
 expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width); expect(state.writes).toEqual([]);
});

test('Day context unavailable and past dates never expose manager editing', async ({ page }) => {
 const state = await setup(page); await page.goto('/schedules'); await tab(page, 'day').click(); await expectDay(page, '2026-11-02');
 await previous(page).click(); await expectDay(page, '2026-11-01');
 await dayPanel(page).getByRole('button', { name: fullDate('2026-11-01'), exact: true }).click();
 await expect(page.getByRole('complementary')).toContainText('Past schedule dates are read-only');
 await expect(page.getByRole('button', { name: 'Edit plan', exact: true })).toHaveCount(0);
 await tab(page, 'day').click();
 await page.route('**/schedules/context', route => route.fulfill({ status: 503, json: { detail: 'Unavailable' }, headers: cors }));
 await page.evaluate(() => window.dispatchEvent(new Event('barticket-shift-updated')));
 await expect(page.getByText('Schedule date could not be verified. Editing is temporarily unavailable.', { exact: true })).toBeVisible();
 await dayPanel(page).getByRole('button', { name: fullDate('2026-11-02'), exact: true }).click();
 await expect(page.getByRole('button', { name: /^(Edit plan|Add plan|\+ Create)$/ })).toHaveCount(0); expect(state.writes).toEqual([]);
});

test('Day ignores stale date response and sign-out clears its plans', async ({ page }) => {
 const state = await setup(page); await page.goto('/schedules'); await tab(page, 'day').click();
 await expectDay(page, '2026-11-02'); await expect(dayPanel(page).getByText('Staff: Haruka', { exact: true })).toBeVisible();
 let release, started = false; const held = new Promise(resolve => { release = resolve; });
 await page.route('**/schedules?date_from=2026-11-02&date_to=2026-11-02', async route => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  started = true; await held; await route.fulfill({ json: [{ ...state.rows[1], manager: { name: 'STALE_DAY_RESPONSE', user_id: null } }], headers: cors });
 });
 await page.evaluate(() => window.dispatchEvent(new Event('barticket-schedules-updated'))); await expect.poll(() => started).toBe(true);
 await next(page).click(); await expectDay(page, '2026-11-03'); await exactRead(state, '2026-11-03');
 const response = page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('date_from=2026-11-02&date_to=2026-11-02'));
 release(); await response; await expect(page.getByText('STALE_DAY_RESPONSE')).toHaveCount(0);
 await expect(dayPanel(page).getByRole('button', { name: /^2026-11-03:/ })).toBeVisible();
 await page.evaluate(() => { localStorage.removeItem('barticket_token'); window.dispatchEvent(new Event('barticket-auth')); });
 await expect(dayPanel(page).getByRole('button', { name: /^2026-11-03:/ })).toHaveCount(0);
 await expect(page.getByText('Haruka')).toHaveCount(0); await expect(page.getByRole('button', { name: '+ Create', exact: true })).toHaveCount(0); expect(state.writes).toEqual([]);
});

for (const locale of ['en', 'ja']) test(`Day uses Week semantic row colors and Details agree ${locale}`, async ({ page }, info) => {
 const state = await setup(page, locale, 'staff', '2026-11-17T12:00:00Z', {
  '2026-11-17': { actual_shift_exists: true, actual_shift_status: 'open' },
  '2026-11-18': { event_value: 'Open', schedule_type: 'open' },
  '2026-11-19': { event_value: 'Live music', schedule_type: 'event', event_notes: 'Live music' },
  '2026-11-20': { event_value: 'Closed', schedule_type: 'closed' },
  '2026-11-21': { actual_shift_exists: true, actual_shift_status: 'closed', actual_shift_closed_at: '2026-11-21T16:00:00Z' },
 });
 await page.setViewportSize({ width: 390, height: 900 }); await page.goto('/schedules'); await tab(page, 'day', locale).click();
 const cases = [
  ['17', 'success', 'success-300', 'success-900', 'Active shift', '営業中のシフト'],
  ['18', 'primary', 'royal-300', 'royal-900', 'Planned shift', 'シフト予定'],
  ['19', 'info', 'info-300', 'info-900', 'Special event', '特別イベント'],
  ['20', 'danger', 'danger-300', 'danger-900', 'Closed', '休業'],
  ['21', 'neutral-500', 'neutral-300', 'neutral-900', 'Finished shift', '終了したシフト'],
 ];
 const colors = await page.evaluate(tokens => Object.fromEntries(tokens.map(token => {
  const probe = document.createElement('span'); probe.style.color = `var(--${token})`; document.body.append(probe);
  const color = getComputedStyle(probe).color; probe.remove(); return [token, color];
 })), [...new Set(cases.flatMap(item => item.slice(1, 4)))]);
 for (const [day, border, color, surface, en, ja] of cases) {
  const date = `2026-11-${day}`; await expectDay(page, date); await exactRead(state, date);
  const event = dayPanel(page).getByRole('button', { name: new RegExp(`^${date}:`) });
  const label = event.locator(':scope > small');
  await expect(label).toHaveText(locale === 'ja' ? ja : en);
  await expect(event).toHaveCSS('border-left-color', colors[border]); await expect(event).toHaveCSS('border-left-width', '3px');
  await expect(event).toHaveCSS('background-color', colors[surface]); await expect(label).toHaveCSS('color', colors[color]);
  await event.click(); const detail = page.getByRole('complementary'), status = detail.locator(':scope > p').filter({ hasText: new RegExp(`^${locale === 'ja' ? ja : en}$`) });
  await expect(status).toHaveCSS('border-left-color', colors[border]); await expect(status).toHaveCSS('background-color', colors[surface]); await expect(status).toHaveCSS('color', colors[color]);
  await page.screenshot({ path: info.outputPath(`audit-day-colors-${locale}-${day}.png`), fullPage: true });
  await next(page, locale).click(); await expect(page.getByRole('complementary')).toHaveCount(0);
 }
 expect(state.writes).toEqual([]);
});

test('Day pending operational default cannot cross authentication sessions', async ({ page }) => {
 const state = await setup(page, 'en', 'staff', '2026-11-13T12:00:00Z');
 let release, started = false; const held = new Promise(resolve => { release = resolve; });
 await page.route('**/schedules/context', async route => {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (route.request().headers()['authorization'] === 'Bearer SCHEDULE_TEST') { started = true; await held; return route.fulfill({ json: context('2026-11-17'), headers: cors }); }
  return route.fulfill({ json: context('2026-11-19'), headers: cors });
 });
 await page.goto('/schedules'); await expect.poll(() => started).toBe(true); await tab(page, 'day').click(); await expectDay(page, '2026-11-13');
 await page.evaluate(() => { localStorage.setItem('barticket_token', 'SESSION_B'); window.dispatchEvent(new Event('barticket-auth')); });
 // Switch via Month to observe the new context before an intentional new Day selection.
 await tab(page, 'month').click(); await expect(page.locator('[aria-current="date"]')).toHaveAttribute('aria-label', fullDate('2026-11-19'));
 await tab(page, 'day').click(); await expectDay(page, '2026-11-19');
 const oldResponse = page.waitForResponse(r => r.url().endsWith('/schedules/context') && r.request().headers()['authorization'] === 'Bearer SCHEDULE_TEST');
 release(); await oldResponse;
 await expectDay(page, '2026-11-19'); await expect(dayPanel(page).locator('[aria-current="date"]')).toHaveAttribute('aria-label', fullDate('2026-11-19'));
 await expect(page.getByRole('complementary')).toHaveCount(0); expect(state.writes).toEqual([]);
});
