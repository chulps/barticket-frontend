import { test, expect } from '@playwright/test';

const shift = (status) => ({
  id: 99, business_date: '2026-11-15', status,
  opened_at: 1794730000, closed_at: status === 'closed' ? 1794750000 : null,
  opened_by: 'Fixture manager', closed_by: status === 'closed' ? 'Fixture manager' : null,
  paid_total: 1000, cash_total: 1000, card_total: 0, other_total: 0,
  cover_total: 0, guest_count: 1, paid_count: 1, cancelled_count: 0,
  staff_hours: [], staff_drinks: [], punches: [], stockouts: [],
});

for (const locale of ['en', 'ja']) {
  test(`only closed shifts expose text, clipboard and LINE sharing: ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(locale => {
      localStorage.setItem('barticket_token', 'fixture-only');
      localStorage.setItem('barticket_locale', locale);
      window.copiedReports = [];
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => window.copiedReports.push(text) } });
    }, locale);
    let status = 'open';
    const writes = [];
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('http://127.0.0.1:8765/**', route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (request.method() !== 'GET') writes.push(path);
      if (path === '/shifts/current' && status === 'stale') return route.fulfill({ status: 409, json: { detail: { code: 'STALE_OPEN_SHIFT', shift_id: 99, business_date: '2026-11-15' } }, headers });
      const values = {
        '/auth/me': { id: 7, name: 'Fixture manager', role: 'manager' },
        '/auth/status': { has_accounts: true }, '/menu': { items: [] },
        '/analytics/shift-index': [shift('closed')],
        '/shifts/current': status === 'open' ? shift('open') : null,
        // Deliberately keep an old closed snapshot after reopening.
        '/analytics/shifts': [shift('closed')], '/tickets': [], '/users': [], '/users/recipients': [],
        '/notices': { notices: [] }, '/push/status': { enabled: false }, '/realtime/events': { cursor: 0, scopes: [] },
        '/notification-activity': { items: [] },
      };
      return route.fulfill({ json: Object.hasOwn(values, path) ? values[path] : {}, headers });
    });
    await page.goto('/analytics');
    const generate = page.getByRole('button', { name: locale === 'ja' ? 'テキストレポートを作成' : 'Generate text report', exact: true });
    const preview = page.getByRole('textbox', { name: locale === 'ja' ? '作成したレポート' : 'Generated report' });
    const share = page.getByRole('link', { name: locale === 'ja' ? 'LINEで共有' : 'Share to LINE', exact: true });
    const copy = page.getByRole('button', { name: locale === 'ja' ? 'テキストをコピー' : 'Copy text', exact: true });
    await expect(generate).toBeDisabled();
    await expect(page.getByText(locale === 'ja' ? 'シフトを締めると、テキストレポートを作成・共有できます。' : 'Close the shift to generate or share a text report.')).toBeVisible();
    await expect(preview).toHaveCount(0);
    await expect(share).toHaveCount(0);
    await expect(copy).toHaveCount(0);

    status = 'closed';
    await page.evaluate(() => window.dispatchEvent(new Event('barticket-shift-updated')));
    await expect(generate).toBeEnabled();
    await generate.click();
    await expect(preview).toBeVisible();
    await expect(preview).toHaveValue(/1,000/);
    await expect(share).toHaveAttribute('href', /^https:\/\/line\.me\/R\/share\?text=/);
    await copy.click();
    expect(await page.evaluate(() => window.copiedReports.length)).toBe(1);

    // A stale reopened night must not fall back to its old closed snapshot.
    status = 'stale';
    await page.evaluate(() => window.dispatchEvent(new Event('barticket-shift-updated')));
    await expect(generate).toBeDisabled();
    await expect(preview).toHaveCount(0);
    await expect(share).toHaveCount(0);
    status = 'closed';
    await page.evaluate(() => window.dispatchEvent(new Event('barticket-shift-updated')));
    await expect(generate).toBeEnabled();

    // A reopened shift must remove an already-expanded report and all send paths.
    status = 'open';
    await page.evaluate(() => window.dispatchEvent(new Event('barticket-shift-updated')));
    await expect(generate).toBeDisabled();
    await expect(preview).toHaveCount(0);
    await expect(share).toHaveCount(0);
    await expect(copy).toHaveCount(0);
    await page.reload();
    await expect(generate).toBeDisabled();
    await expect(share).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}
