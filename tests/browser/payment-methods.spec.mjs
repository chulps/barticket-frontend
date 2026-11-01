import { test, expect } from '@playwright/test';
const NOW = Date.parse('2026-11-01T13:00:00Z');
async function fixture(page, locale) {
 await page.clock.setFixedTime(new Date(NOW));
 await page.addInitScript(locale => { localStorage.setItem('barticket_token', 'ISOLATED_METHOD_FIXTURE'); localStorage.setItem('barticket_locale', locale); }, locale);
 const ticket = { id: 42, name: 'Payment method fixture', status: 'open', service_status: 'completed', service_business_date: '2026-11-01', deferred_at: NOW / 1000, settlement_status: 'outstanding', unpaid_reason: 'pay_later', items: [], guest_count: 0, cover_charge_total: 0, total: 700, amount_paid: 0, balance_due: 700, created_at: NOW / 1000, paid_at: null, cancelled_at: null, payment: null, payments: [] };
 const writes = [];
 await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
 await page.route('http://127.0.0.1:8765/**', async route => {
  const request = route.request(), path = new URL(request.url()).pathname;
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (request.method() === 'POST') {
   writes.push({ path, body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
   await new Promise(r => setTimeout(r, 100));
   const body = request.postDataJSON();
   ticket.amount_paid += body.amount; ticket.balance_due -= body.amount;
   ticket.settlement_status = ticket.balance_due === 0 ? 'settled' : 'partially_paid';
   ticket.payment = { type: body.method, amount: body.amount, paid_at: NOW / 1000 };
   return route.fulfill({ json: ticket, headers });
  }
  const values = { '/auth/me': { id: 7, name: 'Fixture manager', role: 'manager' }, '/auth/status': { has_accounts: true }, '/menu': { items: [] }, '/tickets/receivables': { items: [ticket], total: 1, offset: 0, limit: 50 }, '/shifts/current': null, '/tickets': [], '/users/recipients': [], '/notices': { notices: [] }, '/realtime/events': { cursor: 0, scopes: [] } };
  return route.fulfill({ json: values[path] ?? {}, headers });
 });
 await page.goto('/receivables');
 await page.getByRole('button', { name: locale === 'ja' ? '支払いを記録' : 'Record payment', exact: true }).click();
 return writes;
}
for (const locale of ['en', 'ja']) for (const width of [320, 1280]) for (const method of ['cash', 'card', 'paypay', 'other']) {
 test(`records ${method}, ${locale}, ${width}px without gateway access`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 844 });
  const writes = await fixture(page, locale);
  const labels = locale === 'ja' ? ['現金', 'クレジットカード', 'PayPay', 'その他'] : ['Cash', 'Credit card', 'PayPay', 'Other'];
  const group = page.getByRole('group', { name: locale === 'ja' ? 'お支払い' : 'Receive Payment', exact: true });
  await expect(group.getByRole('button')).toHaveText(labels);
  const button = group.getByRole('button', { name: labels[['cash','card','paypay','other'].indexOf(method)], exact: true });
  await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('spinbutton').fill('300');
  expect(await group.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByRole('dialog').locator('data')).toHaveText('¥700');
  await expect(page.getByRole('dialog').locator('data')).toBeInViewport();
  if (method === 'paypay') await page.screenshot({ path: testInfo.outputPath('payment-methods.png'), fullPage: true });
  const confirm = page.getByRole('button', { name: locale === 'ja' ? '会計を確定' : 'Confirm Payment', exact: true });
  await confirm.evaluate(el => { el.click(); el.click(); });
  await expect(page.getByRole('heading', { name: locale === 'ja' ? '入金を記録しました' : 'Payment recorded' })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('¥400');
  await expect(page.getByText(locale === 'ja' ? '全額お支払い済み' : 'Fully settled', { exact: true })).toHaveCount(0);
  expect(writes).toHaveLength(1); expect(writes[0].path).toBe('/tickets/42/pay');
  expect(writes[0].body).toEqual({ method, amount: 300 }); expect(writes[0].key).toBeTruthy();
 });
}
test('keyboard navigation reaches PayPay and cancel records nothing', async ({ page }) => {
 const writes = await fixture(page, 'en');
 const cash = page.getByRole('button', { name: 'Cash', exact: true }); await cash.focus();
 await page.keyboard.press('ArrowRight'); await expect(page.getByRole('button', { name: 'Credit card', exact: true })).toBeFocused();
 await page.keyboard.press('ArrowRight'); await expect(page.getByRole('button', { name: 'PayPay', exact: true })).toBeFocused();
 await page.keyboard.press('End'); await expect(page.getByRole('button', { name: 'Other', exact: true })).toBeFocused();
 await page.getByRole('button', { name: 'Cancel', exact: true }).click();
 await expect(cash).toHaveCount(0); expect(writes).toHaveLength(0);
 await page.getByRole('button', { name: 'Record payment', exact: true }).click();
 await expect(page.getByRole('button', { name: 'Cash', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
