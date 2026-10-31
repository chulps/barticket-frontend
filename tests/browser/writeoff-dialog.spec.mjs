import { test, expect } from '@playwright/test';

for (const locale of ['en', 'ja']) {
  test(`write-off edits, error and same-attempt retry stay in sync: ${locale}`, async ({ page }) => {
    const requests = [];
    let balance = 700;
    const committed = new Map();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(locale => {
      localStorage.setItem('barticket_token', 'fixture-only');
      localStorage.setItem('barticket_locale', locale);
    }, locale);
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.route('http://127.0.0.1:8765/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
      requests.push({ method: request.method(), path: url.pathname, body: request.postDataJSON(), key: request.headers()['idempotency-key'] });
      if (url.pathname === '/tickets/42/write-off') {
        const attempts = requests.filter(r => r.method === 'POST');
        const key = request.headers()['idempotency-key'], payload = request.postDataJSON();
        if (committed.has(key)) expect(payload).toEqual(committed.get(key));
        else { committed.set(key, payload); balance -= payload.amount; }
        // The first write committed, but its response was lost upstream.
        if(attempts.length === 1) await new Promise(resolve=>setTimeout(resolve,500));
        return route.fulfill({ status: attempts.length === 1 ? 503 : 200, json: attempts.length === 1 ? {detail:'Fixture temporarily unavailable'} : {}, headers: {'Access-Control-Allow-Origin':'*'} });
      }
      const values = {
        '/auth/me': { id: 7, name: 'Fixture manager', role: 'manager' },
        '/auth/status': { has_accounts: true }, '/menu': { items: [] },
        '/tickets/receivables': { items: [{id:42,name:'Fixture ticket',status:'open',items:[],guest_count:0,cover_charge_total:0,total:700,amount_paid:0,balance_due:balance,settlement_status:'outstanding',created_at:1,paid_at:null,cancelled_at:null,payment:null}], total: 1, offset: 0, limit: 50 },
        '/shifts/current': null, '/tickets': [], '/users/recipients': [],
        '/notices': { notices: [] },
      };
      return route.fulfill({ json: values[url.pathname] ?? {}, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.goto('/receivables');
    await page.getByRole('button', { name: locale === 'ja' ? '免除（管理者）' : 'Write off (manager)', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const amount = dialog.getByRole('spinbutton');
    await amount.fill('300');
    await dialog.getByRole('textbox').fill('Fixture-only reason');
    await expect(amount).toHaveValue('300');
    await expect(dialog.getByRole('textbox')).toHaveValue('Fixture-only reason');
    await dialog.getByRole('button', {name:locale === 'ja' ? '免除を記録' : 'Record write-off',exact:true}).click();
    await expect(dialog.getByRole('button',{name:locale === 'ja' ? '保存中…' : 'Saving…',exact:true})).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveText('Fixture temporarily unavailable');
    expect(balance).toBe(400);
    await expect(amount).toBeDisabled();
    await expect(dialog.getByRole('textbox')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', {name:locale === 'ja' ? '免除（管理者）' : 'Write off (manager)',exact:true}).click();
    await expect(amount).toHaveValue('300');
    await expect(amount).toBeDisabled();
    await expect(dialog.getByRole('textbox')).toHaveValue('Fixture-only reason');
    await expect(dialog.getByRole('textbox')).toBeDisabled();
    await dialog.getByRole('button',{name:locale === 'ja' ? '同じ記録を安全に再確認' : 'Safely retry same write-off',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    const writes = requests.filter(r => r.method === 'POST');
    expect(writes).toHaveLength(2);
    expect(writes[0].body).toEqual({amount:300,reason:'Fixture-only reason'});
    expect(writes[0].key).toBeTruthy();
    expect(writes[1]).toEqual(writes[0]);
    await expect.poll(()=>balance).toBe(400);
    await page.getByRole('button', {name:locale === 'ja' ? '免除（管理者）' : 'Write off (manager)',exact:true}).click();
    await expect(amount).toBeEnabled();
    await amount.fill('300');
    await dialog.getByRole('textbox').fill('Fixture-only reason');
    await dialog.getByRole('button', {name:locale === 'ja' ? '免除を記録' : 'Record write-off',exact:true}).click();
    await expect(dialog).toHaveCount(0);
    const next = requests.filter(r=>r.method==='POST')[2];
    expect(next.body).toEqual(writes[0].body);
    expect(next.key).not.toBe(writes[0].key);
    expect(balance).toBe(100);
  });
}
