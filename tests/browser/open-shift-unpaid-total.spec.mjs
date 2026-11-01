import { test, expect } from '@playwright/test';

const shift = { id: 42, business_date: '2026-11-01', status: 'open', opened_at: 1793548800,
  opened_by: 'Fixture manager', paid_total: 2300, paid_count: 1, guest_count: 1,
  cash_total: 2300, card_total: 0, other_total: 0, cancelled_count: 0, punches: [] };
const ticket = (id, amount, extra = {}) => ({
  id, name: 'Fixture ' + id, shiftId: 42, status: 'open', payment: null,
  items: [{ id, type: 'menu', subtotal: amount }], ...extra,
});
async function fixture(page, locale, mode) {
  const rows = mode === 'empty' ? [] : mode === 'zero' ? [ticket(1, 0, { balanceDue: 0 })] : [
    ticket(1, 3900), ticket(2, 1500), ticket(3, 4300, { amountPaid: 3000, balanceDue: 1300 }),
    ticket(4, 7600),
    ticket(5, 9000, {status:'paid'}), ticket(6, 9000, {status:'cancelled'}), ticket(7, 9000, {shiftId:43}),
  ];
  if (mode === 'unknown') rows[2] = ticket(3, 4300, {settlementStatus:'partially_paid'});
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.route('**/open-shift-unpaid-fixture', route => route.fulfill({contentType:'text/html',body:`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
    import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
    localStorage.setItem('barticket_locale', '${locale}');
    const {default:Overview}=await import('/src/pages/OpenShiftOverview.tsx'); import '/src/index.css';
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('main',{style:{padding:'16px',maxWidth:'1000px',margin:'auto'}},React.createElement(Overview,{shift:${JSON.stringify(shift)},tickets:${JSON.stringify(rows)},members:[],notices:{status:'open',business_date:'2026-11-01',notices:[]},updatedAt:null,dateLabel:'November 1'})));
  </script></body></html>`}));
  await page.goto('/open-shift-unpaid-fixture');
}
for (const locale of ['en','ja']) for (const width of [320,390,768,1280]) {
  test(`Open shift unpaid total below ticket rows ${locale} ${width}`, async ({page}, testInfo) => {
    await page.setViewportSize({width,height:1000}); await fixture(page,locale,'normal');
    const card=page.locator('section').filter({has:page.getByRole('heading',{name:locale==='ja'?'未会計のチケット':'Open tickets',exact:true})}).last();
    await expect(card.locator('li')).toHaveCount(4);
    const total=card.getByText(locale==='ja'?'未会計の合計':'Unpaid total',{exact:true}).locator('..');
    await expect(total).toHaveText((locale==='ja'?'未会計の合計':'Unpaid total')+'¥14,300');
    await expect(card.locator('li').nth(2)).toContainText('¥1,300');
    expect((await total.boundingBox()).y).toBeGreaterThanOrEqual((await card.locator('li').last().boundingBox()).y+(await card.locator('li').last().boundingBox()).height);
    const note=card.getByText(locale==='ja'?'未会計の金額は売上に含まれません':'Unpaid amounts are not included in revenue.');
    await expect(note).toBeVisible();
    await expect(page.getByText(locale==='ja'?'売上（現時点）':'Revenue so far',{exact:true}).locator('..')).toContainText('¥2,300');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const box=await total.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(width);
    await card.screenshot({path:testInfo.outputPath('audit-open-shift-unpaid.png')});
  });
}
for (const locale of ['en','ja']) for (const mode of ['empty','zero','unknown']) {
  test(`Open shift unpaid total ${mode} ${locale}`, async ({page},testInfo)=>{
    await page.setViewportSize({width:390,height:1000}); await fixture(page,locale,mode);
    const card=page.locator('section').filter({has:page.getByRole('heading',{name:locale==='ja'?'未会計のチケット':'Open tickets',exact:true})}).last();
    const total=card.getByText(locale==='ja'?'未会計の合計':'Unpaid total',{exact:true}).locator('..');
    await expect(total.locator('strong')).toHaveText(mode==='unknown'?'—':'¥0');
    if(mode==='unknown') {
      const explanation=card.getByText(locale==='ja'?'一部の未会計金額を確認できないため、合計は表示できません。':'Some unpaid amounts are unavailable, so the total cannot be shown.');
      await expect(explanation).toBeVisible();
      const colors=await explanation.evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el.closest('section')).backgroundColor}));
      const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
      const a=luminance(colors.fg),b=luminance(colors.bg);
      expect((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toBeGreaterThanOrEqual(4.5);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await card.screenshot({path:testInfo.outputPath('audit-open-shift-unpaid-state.png')});
  });
}
