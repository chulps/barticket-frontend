import { test, expect } from '@playwright/test';

for (const locale of ['en', 'ja']) {
  test(`global reduced motion preserves focus and feedback ${locale}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(locale => localStorage.setItem('barticket_locale', locale), locale);
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/tests/browser/fixtures/motion-audit.html');
    const input = page.getByLabel('Motion input');
    await input.focus();
    await expect(input).toBeFocused();
    await expect(input).toHaveCSS('transform', 'none');
    expect(await input.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    const button = page.locator('[data-global-button]');
    const idle = await button.evaluate(el => getComputedStyle(el).filter);
    await button.hover();
    await expect(button).toHaveCSS('transform', 'none');
    expect(await button.evaluate(el => getComputedStyle(el).filter)).not.toBe(idle);
    await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
    await expect(page.locator('body')).toHaveCSS('transition-duration', '0s');
    const tabs = page.locator('aside [role=group] button');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    const row = page.getByRole('button', { name: /paid fixture 8/ });
    await expect(row).toHaveCSS('opacity', '1');
    await row.hover();
    await expect(row).toHaveCSS('transform', 'none');
    await row.press('Enter');
    await expect(page.locator('[data-selection]')).toHaveText('108');
  });

  test(`measure repeated ticket entrance without changing normal motion ${locale}`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.addInitScript(locale => localStorage.setItem('barticket_locale', locale), locale);
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/tests/browser/fixtures/motion-audit.html');
    await expect(page.getByRole('button', { name: /open fixture 10/ })).toBeVisible();
    const measurements = [];
    for (const index of [1, 2, 0, 1]) {
      measurements.push(await page.locator('aside').evaluate(async (aside, index) => {
        const tabs = [...aside.querySelectorAll('[role=group] button')];
        const start = performance.now();
        tabs[index].click();
        let firstVisible = null, eighthVisible = null, eighthSettled = null, keyboardActivation = null;
        for (let frame = 0; frame < 90; frame++) {
          await new Promise(requestAnimationFrame);
          const rows = [...aside.querySelectorAll('button')].filter(el => el.textContent.includes('fixture'));
          const elapsed = performance.now() - start;
          if (Number(getComputedStyle(rows[0]).opacity) >= .5 && firstVisible === null) firstVisible = elapsed;
          if (Number(getComputedStyle(rows[7]).opacity) >= .5 && eighthVisible === null) eighthVisible = elapsed;
          const style = getComputedStyle(rows[7]);
          if (Number(style.opacity) >= .99 && (style.transform === 'none' || Math.abs(new DOMMatrix(style.transform).m41) < .5) && eighthSettled === null) eighthSettled = elapsed;
          if (frame === 0) {
            rows[7].focus();
            keyboardActivation = { elapsed, focused: document.activeElement === rows[7], disabled: rows[7].disabled };
          }
          if (eighthSettled !== null) break;
        }
        return { index, firstVisible, eighthVisible, eighthSettled, keyboardActivation };
      }, index));
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-selection]')).toHaveText(String(index * 100 + 8));
    }
    console.log('TICKET_ENTRANCE_TIMINGS', locale, JSON.stringify(measurements));
    await testInfo.attach(`ticket-entrance-${locale}.json`, { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' });
    for (const result of measurements) {
      expect(result.keyboardActivation.focused).toBe(true);
      expect(result.keyboardActivation.disabled).toBe(false);
      expect(result.eighthSettled).not.toBeNull();
    }
    const tabs = page.locator('aside [role=group] button');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /paid fixture 8/ })).toBeVisible();
  });
}
