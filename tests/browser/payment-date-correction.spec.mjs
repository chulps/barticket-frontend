import { test, expect } from '@playwright/test';

const NOW = Date.parse('2026-10-31T13:00:00Z');
const API = 'http://127.0.0.1:8765';

async function correctionFixture(page, { role = 'manager', locale = 'en' } = {}) {
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
    total: 700, amount_paid: 700, balance_due: 0, guest_count: 1, cover_charge_per_person: 0,
    created_at: NOW / 1000 - 86400, paid_at: NOW / 1000, service_completed_at: NOW / 1000 - 80000,
    cancelled_at: null, shift_id: 3, payments: [payment], payment, receivable_history: [] };
  const shift = { id: 3, business_date: '2026-10-30', status: 'closed',
    opened_at: NOW / 1000 - 86400, closed_at: NOW / 1000 - 36000,
    opened_by: 'Fixture manager', closed_by: 'Fixture manager', paid_total: 700,
    cash_total: 700, card_total: 0, other_total: 0, cover_total: 0,
    guest_count: 1, paid_count: 1, cancelled_count: 0, staff_hours: [], staff_drinks: [], punches: [], stockouts: [] };
  const state = { role, ticket, payment, posts: [], reads: [], failNext: null, delay: 0, readDelay: 0 };
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route(API + '/**', async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() === 'GET') state.reads.push(url.pathname + url.search);
    if (req.method() === 'GET' && path === '/tickets/11' && state.readDelay) await new Promise(resolve => setTimeout(resolve, state.readDelay));
    if (req.method() === 'POST' && path === '/tickets/11/payments/101/collection-date') {
      const body = req.postDataJSON(), key = req.headers()['idempotency-key'];
      state.posts.push({ body, key });
      if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
      if (state.failNext) {
        const status = state.failNext; state.failNext = null;
        return route.fulfill({ status, headers, json: { detail: status === 409
          ? { code: 'STALE_PAYMENT_DATE', message: 'Payment changed; refresh and review before correcting.' }
          : 'Simulated uncertain result' } });
      }
      if (state.role !== 'manager') return route.fulfill({ status: 403, headers, json: { detail: 'Manager access required' } });
      if (body.expected_collection_business_date !== payment.collection_business_date || body.expected_collection_shift_id !== payment.collection_shift_id) {
        return route.fulfill({ status: 409, headers, json: { detail: { code: 'STALE_PAYMENT_DATE', message: 'Refresh and review.' } } });
      }
      const before = { collection_business_date: payment.collection_business_date, collection_shift_id: payment.collection_shift_id };
      payment.collection_business_date = body.collection_business_date;
      payment.collection_shift_id = body.collection_business_date === '2026-10-30' ? 3 : 4;
      ticket.receivable_history.push({ type: 'payment_date_corrected', amount: 700, balance_after: 0,
        reason: body.reason, actor: 'Fixture manager', actor_user_id: 7, created_at: NOW / 1000,
        note: JSON.stringify({ payment_id: 101, before, after: { collection_business_date: payment.collection_business_date, collection_shift_id: payment.collection_shift_id } }) });
      return route.fulfill({ headers, json: structuredClone(ticket) });
    }
    const values = {
      '/auth/me': { id: 7, name: 'Fixture manager', role: state.role }, '/auth/status': { has_accounts: true },
      '/shifts/current': null, '/analytics/shift-index': [{ id: 3, business_date: '2026-10-30', status: 'closed' }],
      '/analytics/shifts': [shift], '/tickets': [ticket], '/tickets/11': ticket,
      '/menu': { items: [] }, '/users': [], '/users/recipients': [], '/notices': { notices: [] },
      '/push/status': { enabled: false }, '/realtime/events': { cursor: 0, scopes: [] },
    };
    return route.fulfill({ headers, status: req.method() === 'GET' && path in values ? 200 : 404,
      json: path in values ? values[path] : { detail: 'Unmocked isolated route' } });
  });
  return state;
}

async function openHistoricalPayment(page) {
  await page.goto('/analytics');
  await page.getByRole('button', { name: /Historical cash ticket/ }).click();
  await expect(page.getByRole('button', { name: 'Correct collection date · #101', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Correct collection date · #101', exact: true }).click();
}

async function fillCorrection(page, date = '2026-10-31') {
  await page.getByLabel('Correct collection business date', { exact: true }).fill(date);
  await page.getByLabel('Correction reason', { exact: true }).fill('Receipt confirms the collection business date');
  await page.getByRole('checkbox', { name: 'I verified the actual collection business date and confirm this date correction.' }).check();
}

test('manager corrects historical payment with explicit review, one write and unchanged recorded facts', async ({ page }) => {
  const state = await correctionFixture(page); state.delay = 300;
  await openHistoricalPayment(page);
  await expect(page.getByText('Recorded (unchanged):', { exact: false })).toContainText('JST');
  const save = page.getByRole('button', { name: 'Save date correction', exact: true });
  await expect(save).toBeDisabled();
  await fillCorrection(page, '2026-11-01');
  await expect(save).toBeDisabled();
  await page.getByLabel('Correct collection business date', { exact: true }).fill('2026-10-29');
  await expect(save).toBeDisabled();
  await page.getByLabel('Correct collection business date', { exact: true }).fill('2026-10-31');
  await expect(save).toBeEnabled();
  await save.evaluate(button => { button.click(); button.click(); });
  await expect(page.getByRole('status').filter({ hasText: 'Collection date correction saved.' })).toBeVisible();
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].body).toEqual({ collection_business_date: '2026-10-31', expected_collection_business_date: '2026-10-30', expected_collection_shift_id: 3, reason: 'Receipt confirms the collection business date' });
  expect(state.posts[0].key).toBeTruthy();
  expect(state.payment.recorded_at).toBe(NOW / 1000);
  expect(state.ticket.service_business_date).toBe('2026-10-30');
  expect(state.ticket.total).toBe(700);
  await expect(page.getByText(/Date correction #101: 2026-10-30 → 2026-10-31/).last()).toBeVisible();
  expect(state.reads.filter(path => path.startsWith('/tickets?')).every(path => path.includes('date_from=') && path.includes('date_to='))).toBe(true);
});

test('cancel is read-only and staff cannot open payment correction', async ({ page }) => {
  const state = await correctionFixture(page);
  await openHistoricalPayment(page);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(state.posts).toHaveLength(0);
  state.role = 'staff';
  await page.reload();
  await page.getByRole('button', { name: /Historical cash ticket/ }).click();
  await expect(page.getByRole('button', { name: /Correct collection date/ })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});

test('stale correction requires reload and fresh explicit confirmation instead of replay', async ({ page }) => {
  const state = await correctionFixture(page);
  await openHistoricalPayment(page);
  await fillCorrection(page);
  // A different manager corrected the payment after this review loaded.
  state.payment.collection_business_date = '2026-10-31'; state.payment.collection_shift_id = 4;
  await page.getByRole('button', { name: 'Save date correction', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Payment changed.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry same correction', exact: true })).toBeDisabled();
  expect(state.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Reload latest payment', exact: true }).click();
  await expect(page.getByLabel('Correct collection business date', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save date correction', exact: true })).toBeDisabled();
  await fillCorrection(page, '2026-10-30');
  await page.getByRole('button', { name: 'Save date correction', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Collection date correction saved.' })).toBeVisible();
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1].body.expected_collection_business_date).toBe('2026-10-31');
  expect(state.posts[1].body.expected_collection_shift_id).toBe(4);
  expect(state.posts[1].key).not.toBe(state.posts[0].key);
});

test('uncertain result freezes payload and retries with the same idempotency key', async ({ page }) => {
  const state = await correctionFixture(page); state.failNext = 503;
  await openHistoricalPayment(page);
  await fillCorrection(page);
  await page.getByRole('button', { name: 'Save date correction', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Outcome unknown.' })).toBeVisible();
  await expect(page.getByLabel('Correct collection business date', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Correction reason', { exact: true })).toBeDisabled();
  expect(state.posts).toHaveLength(1);
  await page.getByRole('button', { name: 'Retry same correction', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Collection date correction saved.' })).toBeVisible();
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1]).toEqual(state.posts[0]);
});

test('permission loss rejects the write and offers no automatic retry', async ({ page }) => {
  const state = await correctionFixture(page);
  await openHistoricalPayment(page);
  await fillCorrection(page); state.role = 'staff';
  await page.getByRole('button', { name: 'Save date correction', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Access could not be verified.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry same correction', exact: true })).toBeDisabled();
  expect(state.posts).toHaveLength(1);
  expect(state.payment.collection_business_date).toBe('2026-10-30');
});

test('dirty dismissal requires confirmation and never sends a correction', async ({ page }) => {
  const state = await correctionFixture(page);
  await openHistoricalPayment(page);
  await page.getByLabel('Correction reason', { exact: true }).fill('Unfinished review');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Correction reason', { exact: true })).toHaveValue('Unfinished review');
  page.once('dialog', dialog => dialog.accept());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});

test('session change during initial read cannot reveal the previous review', async ({ page }) => {
  const state = await correctionFixture(page); state.readDelay = 500;
  const lateRead = page.waitForResponse(response => response.url() === API + '/tickets/11');
  await openHistoricalPayment(page);
  await expect(page.getByText('Checking latest payment…', { exact: true })).toBeVisible();
  await page.evaluate(() => { localStorage.removeItem('barticket_token'); window.dispatchEvent(new Event('barticket-auth')); });
  await lateRead;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Correct collection business date', { exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(0);
});

test('session change during save suppresses late success UI without retrying', async ({ page }) => {
  const state = await correctionFixture(page); state.delay = 500;
  await openHistoricalPayment(page);
  await fillCorrection(page);
  const lateSave = page.waitForResponse(response => response.url().endsWith('/payments/101/collection-date'));
  await page.getByRole('button', { name: 'Save date correction', exact: true }).click();
  await expect.poll(() => state.posts.length).toBe(1);
  await page.evaluate(() => { localStorage.removeItem('barticket_token'); window.dispatchEvent(new Event('barticket-auth')); });
  await lateSave;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Collection date correction saved.', { exact: true })).toHaveCount(0);
  expect(state.posts).toHaveLength(1);
});

test('Japanese correction labels retain distinct recorded and business dates', async ({ page }) => {
  const state = await correctionFixture(page, { locale: 'ja' });
  await page.goto('/analytics');
  await page.getByRole('button', { name: /Historical cash ticket/ }).click();
  await page.getByRole('button', { name: '回収営業日を修正 · #101', exact: true }).click();
  await expect(page.getByText('記録日時（変更されません）:', { exact: false })).toContainText('JST');
  await expect(page.getByLabel('正しい回収営業日', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: '日付修正を保存', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click();
  expect(state.posts).toHaveLength(0);
});
