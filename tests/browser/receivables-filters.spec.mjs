import { test, expect } from '@playwright/test';

for (const locale of ['en', 'ja']) {
  test(`receivables reason stays visible when returning to unpaid balances: ${locale}`, async ({ page }) => {
    const requests = [];
    await page.setViewportSize({ width: 390, height: 844 });
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
        '/tickets/receivables': { items: [], total: 0, offset: 0, limit: 50 },
        '/shifts/current': null, '/tickets': [], '/users/recipients': [],
        '/notices': { notices: [] },
      };
      return route.fulfill({ json: values[url.pathname] ?? {}, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.goto('/receivables');
    const status = page.getByRole('combobox', { name: locale === 'ja' ? '状態' : 'Status', exact: true });
    const reason = page.getByRole('combobox', { name: locale === 'ja' ? '理由' : 'Reason', exact: true });
    await status.selectOption('all');
    await reason.selectOption('walkout');
    await status.selectOption('unresolved');
    await expect(reason).toBeVisible();
    await expect(reason).toHaveValue('walkout');
    await reason.selectOption('');
    await expect.poll(() => requests.filter(r => r.path === '/tickets/receivables').at(-1)?.query).toBe('offset=0&limit=50&settlement_status=outstanding&settlement_status=partially_paid');
    expect(requests.every(r => r.method === 'GET')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
