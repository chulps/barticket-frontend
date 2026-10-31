import { test, expect } from '@playwright/test';

async function fixture(page, locale = 'en', { tall = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-31T12:00:00Z'));
  await page.addInitScript(locale => {
    localStorage.setItem('barticket_token', 'VIEWPORT_FIXTURE_ONLY');
    localStorage.setItem('barticket_locale', locale);
  }, locale);
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('http://127.0.0.1:8765/**', route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const item = { id: 1, menu_item_id: 1, name: 'Highball', quantity: 1, unit_price: 700, subtotal: 700 };
    const tickets = Array.from({ length: 35 }, (_, i) => ({ id: i + 1, name: `Guest ${i + 1}`, status: 'open', shift_id: 3, items: tall ? Array.from({ length: 30 }, (_, i) => ({ ...item, id: i + 1, name: `Long ticket line ${i + 1}` })) : [item], guest_count: 0, cover_charge_per_person: 0, cover_charge_total: 0, total: 700, created_at: 1793448000, payment: null, staff_drinks: [] }));
    const values = {
      '/auth/me': { id: 7, name: 'Fixture manager', role: 'manager' },
      '/auth/status': { has_accounts: true, google_enabled: false },
      '/menu': { items: Array.from({ length: tall ? 50 : 1 }, (_, i) => ({ id: i + 1, name: tall ? `Fixture drink ${i + 1}` : 'Highball', category: 'Whisky', prices: { standard: 700 }, inStock: true })) },
      '/shifts/current': { id: 3, business_date: '2026-10-31', status: 'open', punches: [{ user_id: 7, clock_out: null }], staff_hours: [] },
      '/venue-status': { business_date: '2026-10-31', status: 'open' },
      '/tickets': tickets, '/notices': { notices: [] }, '/users/recipients': [],
    };
    return route.fulfill({ json: values[path] ?? {}, headers });
  });
}
async function inViewport(locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox(), size = locator.page().viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
}
for (const locale of ['en', 'ja']) for (const [width, height] of [[390, 600], [390, 844], [1280, 720], [1440, 1000]]) {
  test(`ticket shell and status labels fit ${locale} ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await fixture(page, locale); await page.goto('/tickets');
    const board = page.locator('[data-ticket-dashboard]');
    const group = page.getByRole('group', { name: locale === 'ja' ? '状態' : 'Status', exact: true });
    await expect(page.getByRole('complementary').getByRole('button', { name: /Guest 35/ })).toHaveCount(1);
    await inViewport(board); await inViewport(group);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    // A range measures actual rendered text lines, not merely scroll overflow.
    expect(await group.getByRole('button').evaluateAll(buttons => buttons.every(button => {
      const range = document.createRange(); range.selectNodeContents(button);
      return range.getClientRects().length === 1 && button.scrollWidth <= button.clientWidth + 1;
    }))).toBe(true);
    await group.getByRole('button').last().click();
    await expect.poll(async () => group.evaluate(el => {
      const active = el.querySelector('[aria-pressed="true"]').getBoundingClientRect();
      const indicator = el.querySelector('[data-tab-indicator]').getBoundingClientRect();
      return Math.abs(active.left - indicator.left) + Math.abs(active.width - indicator.width);
    })).toBeLessThan(1);
    await group.getByRole('button').first().click();
    const last = page.getByRole('complementary').getByRole('button', { name: /Guest 35/ });
    await last.scrollIntoViewIfNeeded(); await inViewport(last);
    // Scroll the ticket rail, not the document/header.
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });
}

test('resizing ticket details preserves menu and dialog access; leaving board restores document flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await fixture(page); await page.goto('/tickets');
  await page.getByRole('button', { name: /Guest 1\b/ }).first().click();
  await page.setViewportSize({ width: 390, height: 420 }); // Layout resize, not an assertion of real OS keyboard behavior.
  const actions = page.getByRole('button', { name: 'Actions for Highball', exact: true });
  await actions.click(); await inViewport(page.getByRole('menu'));
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Item', exact: true }).click();
  await inViewport(page.getByRole('dialog'));
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/menu');
  expect(await page.locator('[data-ticket-dashboard]').count()).toBe(0);
  expect(await page.locator('#root').evaluate(el => getComputedStyle(el).display)).not.toBe('flex');
});

test('text enlargement keeps full status names reachable without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 }); await fixture(page); await page.goto('/tickets');
  const group = page.getByRole('group', { name: 'Status', exact: true });
  await expect(group).toBeVisible();
  await page.addStyleTag({ content: 'button { font-size: 32px !important; }' });
  await group.getByRole('button').first().focus();
  await page.keyboard.press('End');
  const cancelled = group.getByRole('button', { name: 'Cancelled', exact: true });
  await expect(cancelled).toBeFocused(); await expect(cancelled).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => cancelled.evaluate(el => {
    const button = el.getBoundingClientRect(), viewport = el.parentElement.parentElement.getBoundingClientRect();
    return button.right <= viewport.right + 1 && button.left >= viewport.left - 1;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const width of [390, 1280]) test(`tall ticket, dialog and normal route content remain reachable at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 600 }); await fixture(page, 'en', { tall: true }); await page.goto('/tickets');
  if (width < 769) await page.getByRole('button', { name: /Guest 1\b/ }).first().click();
  const closeTicket = page.getByRole('button', { name: 'Close ticket', exact: true });
  await closeTicket.scrollIntoViewIfNeeded(); await inViewport(closeTicket);
  await page.getByRole('button', { name: 'Add Item', exact: true }).click();
  const dialog = page.getByRole('dialog'); await inViewport(dialog);
  const lastDrink = dialog.getByText('Fixture drink 50', { exact: true });
  await lastDrink.scrollIntoViewIfNeeded(); await inViewport(lastDrink);
  // The batch footer appears only after choosing a drink (no save/write).
  await dialog.getByRole('button', { name: '¥700', exact: true }).last().click();
  const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
  await cancel.scrollIntoViewIfNeeded(); await inViewport(cancel); await cancel.click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/menu');
  const lastMenuDrink = page.getByText('Fixture drink 50', { exact: true });
  await lastMenuDrink.scrollIntoViewIfNeeded(); await inViewport(lastMenuDrink);
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
});
