import { test, expect } from '@playwright/test';
const API = 'http://127.0.0.1:8765';
const shift = { id: 10, business_date: '2026-10-31', status: 'open', opened_at: 1793480400, punches: [], staff_hours: [], staff_drinks: [], stockouts: [], paid_total: 0, cash_total: 0, card_total: 0, other_total: 0 };
async function fixture(page, shared) {
  const sockets = []; const writes = [];
  await page.clock.install({ time: new Date('2026-10-31T20:00:00Z') });
  await page.addInitScript(() => { localStorage.setItem('barticket_token', 'ISOLATED_SHIFT_FIXTURE'); localStorage.setItem('barticket_locale', 'en'); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.routeWebSocket('**/realtime/ws', socket => { sockets.push(socket); socket.onMessage(message => {
    if (JSON.parse(message).type === 'authenticate') socket.send(JSON.stringify({type:'ready',version:1,cursor:0}));
  }); });
  await page.route(API + '/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
    if (req.method() === 'OPTIONS') return route.fulfill({status:204,headers});
    if (req.method() !== 'GET') writes.push(path);
    const values = {'/auth/status':{has_accounts:true},'/auth/me':{id:7,name:'Fixture manager',role:'manager'}, '/menu':{items:[],coverCharge:0},
      '/shifts/current':shared.current, '/shifts': shared.current ? [shared.current] : [], '/analytics/shifts': shared.current ? [] : [{...shift,status:'closed'}], '/tickets':[], '/users':[], '/notices':{notices:[]},
      '/shifts/close-readiness': {shift:shared.current,can_close:true,blockers:[],open_ticket_count:0,clocked_in_staff:[],automatic_clock_out:{will_clock_out_count:0,will_clock_out_staff:[],source:"shift_close"},manager_keep_open:false,manager_keep_open_history:[],approved_carry_forwards:[],finalized_totals:{collected_total:0,cash_total:0,card_total:0,other_total:0},receivables:{count:0,billed_total:0,collected_total:0,outstanding_total:0}}, '/push/config':{enabled:false}};
    if (path === '/shifts/close-readiness' && shared.holdReadiness) {
      shared.holdReadiness = false;
      await new Promise(resolve => { shared.releaseReadiness = resolve; });
    }
    return route.fulfill({json:path in values ? values[path] : {},headers});
  });
  await page.goto('/profile?section=shift');
  await expect(page.getByRole('heading', {name:'My Time Clock',exact:true})).toBeVisible();
  await expect.poll(() => sockets.length).toBe(1);
  await page.clock.runFor(500);
  await expect(page.getByRole('button',{name:'Review & Close Shift',exact:true})).toBeVisible();
  return { writes, send: () => sockets.at(-1).send(JSON.stringify({type:'invalidate',version:1,cursor:2,scopes:['shift','session']})), reconnect: () => sockets.at(-1).close() };
}
test('two clients refresh closed and opened shifts; stale close modal cannot submit', async ({page,context}) => {
  const other = await context.newPage(), shared = {current:shift};
  const a = await fixture(page,shared), b = await fixture(other,shared);
  await other.getByRole('button',{name:'Review & Close Shift',exact:true}).click();
  await other.clock.runFor(500);
  const dialog = other.getByRole('dialog');
  await expect(dialog.getByRole('checkbox')).toBeVisible();
  await dialog.getByRole('checkbox').check();
  await expect(dialog.getByRole('button',{name:'Confirm & close shift'})).toBeEnabled();
  shared.current = null; a.send(); b.send();
  for (const p of [page,other]) await p.clock.runFor(500);
  await expect(dialog.getByText('This shift has changed. Refresh its status before closing.')).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Confirm & close shift'})).toHaveCount(0);
  await expect(page.getByText('No shift is open. Any signed-in staff member can start the business shift.')).toBeVisible();
  shared.current = {...shift,id:11}; a.send(); b.send();
  for (const p of [page,other]) await p.clock.runFor(500);
  await expect(page.getByRole('button',{name:'Review & Close Shift',exact:true})).toBeVisible();
  await expect(dialog.getByText('This shift has changed. Refresh its status before closing.')).toBeVisible();
  expect([...a.writes,...b.writes]).toEqual([]);
});
test('reconnect invalidates stale close review without retrying writes', async ({page}) => {
  const shared = {current:shift}, h = await fixture(page,shared);
  await page.getByRole('button',{name:'Review & Close Shift',exact:true}).click(); await page.clock.runFor(500);
  const dialog = page.getByRole('dialog'); await dialog.getByRole('checkbox').check();
  shared.current = null; h.reconnect(); await page.clock.runFor(3000);
  await expect(dialog.getByText('This shift has changed. Refresh its status before closing.')).toBeVisible();
  expect(h.writes).toEqual([]);
});

 test('invalidation during final preflight prevents stale POST and requires fresh acknowledgement', async ({page}) => {
  const shared = {current:shift}, h = await fixture(page,shared);
  await page.getByRole('button',{name:'Review & Close Shift',exact:true}).click(); await page.clock.runFor(500);
  const dialog = page.getByRole('dialog'); await dialog.getByRole('checkbox').check();
  shared.holdReadiness = true;
  await dialog.getByRole('button',{name:'Confirm & close shift'}).click();
  await expect.poll(() => typeof shared.releaseReadiness).toBe('function');
  shared.current = null; h.send(); await page.clock.runFor(500);
  await expect(dialog.getByRole('button',{name:'Closing shift…'})).toBeDisabled();
  shared.releaseReadiness();
  await page.clock.runFor(500);
  await expect(dialog.getByText('This shift has changed. Refresh its status before closing.')).toBeVisible();
  expect(h.writes).toEqual([]);
});
