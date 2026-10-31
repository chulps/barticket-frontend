import { test, expect } from '@playwright/test';

for (const locale of ['en', 'ja']) for (const width of [320,1280]) {
  test(`receivables readable localized details: ${locale} ${width}`, async ({ page }, testInfo) => {
    const requests = [];
    await page.setViewportSize({ width, height: 844 });
    await page.addInitScript(locale => {
      localStorage.setItem('barticket_token', 'fixture-only');
      localStorage.setItem('barticket_locale', locale);
    }, locale);
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('http://127.0.0.1:8765/**', route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
      requests.push({ method: request.method(), path: url.pathname, query: url.searchParams.toString() });
      const values = {
        '/auth/me': { id: 7, name: 'Fixture manager', role: 'manager' },
        '/auth/status': { has_accounts: true }, '/menu': { items: [] },
        '/tickets/receivables': { items: [{id:42,name:"Long customer name お客様のお名前を表示",status:"open",items:[],guest_count:0,cover_charge_total:0,total:700,balance_due:700,amount_paid:0,settlement_status:"outstanding",unpaid_reason:"pay_later",unpaid_note:"Follow up after terminal outage / 端末障害後に確認",created_at:1,paid_at:null,cancelled_at:null,payment:null}], total: 1, offset: 0, limit: 50 },
        '/shifts/current': null, '/tickets': [], '/users/recipients': [],
        '/notices': { notices: [] },
      };
      return route.fulfill({ json: values[url.pathname] ?? {}, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.goto('/receivables');
    await expect(page.getByRole('button',{name:locale==='ja'?'支払いを記録':'Record payment',exact:true})).toBeVisible();
    await expect(page.locator('article dd').filter({hasText:locale==='ja'?'後払いの合意':'Agreed to pay later'})).toHaveCount(1);
    await expect(page.locator('article')).not.toContainText('pay_later');
    const heading = page.locator('main').getByRole('heading',{level:1});
    expect(await heading.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
    const card=page.locator('article').first();
    expect(await card.evaluate(el=>el.getBoundingClientRect().right<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath('receivables.png'),fullPage:true});
    expect(requests.every(r=>r.method==='GET')).toBe(true);
  });
}
