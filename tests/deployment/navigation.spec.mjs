import { test, expect } from '@playwright/test';
async function fixture(page) {
  const writes = [], reads = [];
  await page.addInitScript(() => { localStorage.setItem('barticket_token', 'ISOLATED_DEPLOYMENT_FIXTURE'); localStorage.setItem('barticket_locale', 'en'); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('http://127.0.0.1:8765/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'*', 'Access-Control-Allow-Methods':'*' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status:204, headers });
    if (request.method() !== 'GET') writes.push(path); else reads.push(path);
    const data = {
      '/auth/me': { id:7, name:'Fixture manager', role:'manager', has_password:true }, '/auth/status':{ has_accounts:true },
      '/menu':{ items:[{ id:1, name:'Highball', category:'Whisky', prices:{standard:700}, inStock:true }] },
      '/users':[{id:7,name:'Fixture manager',role:'manager'}], '/shifts/current':null, '/notices':{ notices:[] }, '/users/recipients':[], '/push/status':{ enabled:false },
      '/realtime/events':{ cursor:0, scopes:[] }, '/schedules':[], '/tickets':[],
    };
    return route.fulfill({ headers, status: path in data ? 200 : 404, json: data[path] ?? {detail:'Unmocked isolated API'} });
  });
  return { writes, reads };
}
const deploy = (request, version, retain = '') => request.post(`/__deploy?version=${version}&retain=${retain}`);
const bell = page => page.locator('header a[href="/notifications"]:visible');

test('reproduces the old unguarded lazy-route blackout after assets are replaced', async ({page, request}) => {
  await deploy(request, 'legacy-unguarded'); await fixture(page);
  const errors=[]; page.on('pageerror', error => errors.push(error));
  await page.goto('/menu'); await expect(bell(page)).toBeVisible();
  await deploy(request, 'safe-b'); await bell(page).click();
  await expect.poll(() => errors.length).toBeGreaterThan(0);
  await expect(page.locator('#root')).toBeEmpty();
});

test('retained immutable assets keep an already-open legacy session navigating', async ({page, request}) => {
  await deploy(request, 'legacy-unguarded'); const state = await fixture(page);
  await page.goto('/menu'); await expect(bell(page)).toBeVisible();
  await deploy(request, 'retained-b'); await bell(page).click();
  await expect(page.getByRole('heading', {name:'Notifications', exact:true})).toBeVisible();
  expect(state.writes).toEqual([]);
});

test('guarded chunk failure keeps shell and login, and navigation can recover without reloading', async ({page, request}) => {
  await deploy(request, 'legacy-guarded'); const state=await fixture(page);
  await page.goto('/menu'); await expect(bell(page)).toBeVisible();
  await page.evaluate(() => { window.sessionIdentity='still-mounted'; });
  await deploy(request, 'safe-b'); await bell(page).click();
  await expect(page.getByRole('alert')).toContainText('This screen could not be opened');
  await expect(page.locator('header')).toBeVisible();
  expect(await page.evaluate(() => window.sessionIdentity)).toBe('still-mounted');
  expect(await page.evaluate(() => localStorage.getItem('barticket_token'))).toBe('ISOLATED_DEPLOYMENT_FIXTURE');
  await page.locator('header a[href="/menu"]:visible').click();
  await expect(page.getByRole('textbox', {name:'Search menu'})).toBeVisible();
  expect(state.writes).toEqual([]);
});

test('deployment preserves an unsaved dialog and eager navigation needs no new script, even offline', async ({page, request, context}) => {
  await deploy(request, 'safe-a'); const state = await fixture(page);
  await page.goto('/menu'); await expect(bell(page)).toBeVisible();
  await page.getByRole('button', {name:'Actions for Highball'}).click();
  await page.getByRole('menuitem', {name:'Edit Item', exact:true}).click();
  const draft = page.getByRole('dialog').getByRole('textbox', {name:/Name/i});
  await draft.fill('Unfinished deployment draft');
  await page.evaluate(() => { window.sessionIdentity='unchanged'; });
  const scripts=[]; page.on('request', req => { if (req.resourceType() === 'script') scripts.push(req.url()); });
  await deploy(request, 'safe-b');
  await expect(draft).toHaveValue('Unfinished deployment draft');
  expect(await page.evaluate(() => window.sessionIdentity)).toBe('unchanged');
  // User explicitly abandons their test draft; deployment did not dismiss it.
  page.once('dialog', dialog => dialog.accept()); await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await context.setOffline(true); await bell(page).click();
  await expect(page.getByRole('heading', {name:'Notifications', exact:true})).toBeVisible();
  expect(scripts).toEqual([]); expect(state.writes).toEqual([]);
  expect(state.reads.some(path => path.startsWith('/analytics') || path.startsWith('/schedules'))).toBe(false);
  await context.setOffline(false);
  await page.goBack();
  await expect(page.getByRole('textbox', {name:'Search menu'})).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', {name:'Notifications', exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', {name:'Notifications', exact:true})).toBeVisible();
});

test('a pending mocked mutation completes once without deployment restarting or dismissing its dialog', async ({page, request}) => {
  await deploy(request, 'safe-a'); await fixture(page);
  let release; const completion = new Promise(resolve => { release = resolve; });
  const writes = [];
  await page.route('http://127.0.0.1:8765/menu/items/1', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status:204, headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'} });
    writes.push(route.request().postDataJSON());
    await completion;
    return route.fulfill({ headers:{'Access-Control-Allow-Origin':'*'}, json:{id:1,...writes[0], inStock:true} });
  });
  await page.goto('/menu');
  await page.getByRole('button', {name:'Actions for Highball'}).click();
  await page.getByRole('menuitem', {name:'Edit Item', exact:true}).click();
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('textbox', {name:/Name/i}).fill('Confirmed fixture edit');
  await page.evaluate(() => { window.sessionIdentity='mutation-pending'; });
  await dialog.getByRole('button', {name:'Save', exact:true}).click();
  await expect.poll(() => writes.length).toBe(1);
  try {
    await deploy(request, 'safe-b');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', {name:/Saving/})).toBeDisabled();
    expect(await page.evaluate(() => window.sessionIdentity)).toBe('mutation-pending');
  } finally { release(); }
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(1);
  await bell(page).click();
  await expect(page.getByRole('heading', {name:'Notifications', exact:true})).toBeVisible();
});

test('a failed route does not destroy an open unsaved modal during history navigation', async ({page, request}) => {
  await deploy(request, 'legacy-guarded'); const state=await fixture(page);
  await page.goto('/menu');
  await page.getByRole('button', {name:'Actions for Highball'}).click();
  await page.getByRole('menuitem', {name:'Edit Item', exact:true}).click();
  const draft=page.getByRole('dialog').getByRole('textbox', {name:/Name/i});
  await draft.fill('Keep this unsaved dialog');
  await deploy(request, 'safe-b');
  await page.evaluate(() => { history.pushState({}, '', '/notifications'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByRole('alert')).toContainText('This screen could not be opened');
  await expect(draft).toHaveValue('Keep this unsaved dialog');
  expect(state.writes).toEqual([]);
});


test('healthy nested Admin navigation preserves the requested section instead of remounting', async ({page, request}) => {
  await deploy(request, 'safe-a'); const state = await fixture(page);
  await page.goto('/admin/staff/7');
  await page.getByRole('navigation', {name:'Admin sections'}).getByRole('button', {name:'Accounts', exact:true}).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('button', {name:'Refresh accounts', exact:true})).toBeVisible();
  expect(state.writes).toEqual([]);
});
