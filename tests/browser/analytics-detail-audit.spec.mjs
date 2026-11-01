import { test, expect } from '@playwright/test';

// Synthetic historical ticket shape reused from payment-date-correction.spec.mjs.
const NOW = Date.parse('2026-10-31T13:00:00Z');
const API = 'http://127.0.0.1:8765';

async function analyticsFixture(page, { role = 'manager', locale = 'en', mode = 'normal' } = {}) {
  await page.clock.setFixedTime(new Date(NOW));
  await page.addInitScript(locale => {
    localStorage.setItem('barticket_token', 'ISOLATED_CORRECTION_FIXTURE');
    localStorage.setItem('barticket_locale', locale);
  }, locale);
  const payment = { id: 101, type: 'cash', amount: 700, paid_at: NOW / 1000,
    recorded_at: NOW / 1000, collection_business_date: '2026-10-30', collection_shift_id: 3,
    collected_by: 'Fixture manager', voided_at: null };
  const ticket = { id: 11, name: 'Historical cash ticket', status: 'paid',
    service_status: 'completed', settlement_status: 'settled', service_business_date: '2026-10-30',
    items: [{ id: 1, name: 'Highball', price_key: 'standard', quantity: 1, unit_price: 700, subtotal: 700 }],
    total: 700, amount_paid: 700, balance_due: 0, guest_count: 1, cover_charge_per_person: 0, cover_charge_total: 0,
    created_at: NOW / 1000 - 86400, paid_at: NOW / 1000, service_completed_at: NOW / 1000 - 80000,
    cancelled_at: null, shift_id: 3, payments: [payment], payment, receivable_history: [] };
  const shift = { id: 3, business_date: '2026-10-30', status: 'closed',
    opened_at: NOW / 1000 - 86400, closed_at: NOW / 1000 - 36000,
    opened_by: 'Fixture manager', closed_by: 'Fixture manager', paid_total: 700,
    cash_total: 700, card_total: 0, other_total: 0, cover_total: 0,
    guest_count: 1, paid_count: 1, cancelled_count: 0, staff_hours: [], staff_drinks: [], punches: [], stockouts: [] };
  if (mode === 'partial') { shift.cash_total = 0; shift.paid_count = 0; }
  const state = { mode, role, ticket, payment, posts: [], reads: [], failNext: null, delay: 0, readDelay: 0 };
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route(API + '/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() === 'GET') state.reads.push(url.pathname + url.search);
    if (req.method() === 'GET' && path === '/tickets/11' && state.readDelay) await new Promise(resolve => setTimeout(resolve, state.readDelay));
    if (req.method() !== 'GET') { state.posts.push(path); return route.fulfill({status:405,headers,json:{detail:'Read-only audit'}}); }
    if (state.mode === 'error' && path === '/analytics/shifts') return route.fulfill({status:503,headers,json:{detail:'Synthetic report unavailable'}});
    const values = {
      '/auth/me': { id: 7, name: 'Fixture manager', role: state.role }, '/auth/status': { has_accounts: true },
      '/shifts/current': null, '/analytics/shift-index': mode === 'empty' ? [] : [{ id: 3, business_date: '2026-10-30', status: 'closed' }],
      '/analytics/shifts': mode === 'empty' ? [] : [shift], '/tickets': ['empty','partial'].includes(mode) ? [] : [ticket], '/tickets/11': ticket,
      '/menu': { items: [] }, '/users': [], '/users/recipients': [], '/notices': { notices: [] },
      '/push/status': { enabled: false }, '/realtime/events': { cursor: 0, scopes: [] },
    };
    return route.fulfill({ headers, status: req.method() === 'GET' && path in values ? 200 : 404,
      json: path in values ? values[path] : { detail: 'Unmocked isolated route' } });
  });
  return state;
}


async function fits(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
const picker = page => page.locator('main button[aria-expanded]').filter({hasText:'2026'}).first();
for (const locale of ['en','ja']) for (const width of [320,768,1280]) {
 test(`Analytics date-picker Escape restores focus ${locale} ${width}`, async ({page}) => {
  const state = await analyticsFixture(page,{locale});
  await page.setViewportSize({width,height:900}); await page.goto('/analytics');
  const trigger = picker(page); await expect(trigger).toBeVisible();
  await expect(page.getByRole('button',{name:/Historical cash ticket/})).toBeVisible();
  const reads = state.reads.filter(p=>p.startsWith('/tickets?')||p.startsWith('/analytics/shifts?')).length;
  await trigger.focus(); await trigger.press('Enter'); await expect(trigger).toHaveAttribute('aria-expanded','true');
  // A real Tab transfer into the popup is essential: Escape on the trigger would hide the bug.
  await page.keyboard.press('Tab'); await expect(trigger).not.toBeFocused();
  await page.keyboard.press('Escape'); await expect(trigger).toHaveAttribute('aria-expanded','false');
  await expect(trigger).toBeFocused();
  await trigger.press('Enter');
  // October's leading September 30 and selected October 30 are separate cells.
  const selectedDay=trigger.locator('..').getByRole('button',{name:'30',exact:true}).last();
  await selectedDay.focus(); await selectedDay.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded','false'); await expect(trigger).toBeFocused();
  expect(state.reads.filter(p=>p.startsWith('/tickets?')||p.startsWith('/analytics/shifts?')).length).toBe(reads);
  expect(state.posts).toEqual([]); await fits(page);
 });
 test(`Analytics ticket detail keyboard and reflow ${locale} ${width}`, async ({page}) => {
  const state = await analyticsFixture(page,{locale});
  await page.setViewportSize({width,height:900}); await page.goto('/analytics');
  const ticket = page.getByRole('button',{name:/Historical cash ticket/});
  await expect(ticket).toBeVisible(); await ticket.focus(); await ticket.press('Enter');
  await expect(ticket).toHaveAttribute('aria-expanded','true');
  await expect(page.getByText('Highball',{exact:true}).last()).toBeVisible();
  await fits(page); await ticket.press('Space'); await expect(ticket).toHaveAttribute('aria-expanded','false');
  await expect(ticket).toBeFocused();
  const trigger=picker(page); await trigger.click();
  const popup=trigger.locator('..').locator(':scope > div').last();
  await expect(popup).toBeVisible();
  const rect=await popup.boundingBox(); expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.x+rect.width).toBeLessThanOrEqual(width);
  await fits(page); await page.keyboard.press('Escape'); expect(state.posts).toEqual([]);
 });
 for (const mode of ['empty','error','partial']) test(`Analytics ${mode} financial data state ${locale} ${width}`,async({page})=>{
  const state=await analyticsFixture(page,{locale,mode}); await page.setViewportSize({width,height:900}); await page.goto('/analytics');
  if(mode==='empty') await expect(page.getByText(locale==='ja'?'この期間の営業日はありません。':'No closed nights in this range.',{exact:true})).toBeVisible();
  if(mode==='error') {
   await expect(page.getByRole('alert')).toContainText(locale==='ja'?'表示内容が古い可能性があります':'Displayed data may be outdated');
   await expect(page.getByRole('button',{name:/Historical cash ticket/})).toHaveCount(0);
   await expect(page.getByText(locale==='ja'?'この期間の営業日はありません。':'No closed nights in this range.',{exact:true})).toHaveCount(0);
  }
  if(mode==='partial') {
   await expect(page.getByText(locale==='ja'?'支払方法未記録':'Payment type not recorded',{exact:true})).toBeVisible();
   await expect(page.getByText(locale==='ja'?'チケット数は未記録':'Ticket counts not recorded',{exact:true})).toBeVisible();
   await expect(page.getByText(locale==='ja'?'この期間の伝票はありません。':'No tickets in this range.',{exact:true})).toHaveCount(0);
  }
  await fits(page); expect(state.posts).toEqual([]);
 });
}
