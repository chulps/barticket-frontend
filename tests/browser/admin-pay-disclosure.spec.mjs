import { test, expect } from "@playwright/test";

async function previewFixture(page, locale = "en") {
  const writes = [];
  let fail = true;
  await page.route("**/*", route => {
    const host = new URL(route.request().url()).hostname;
    return host === "127.0.0.1" ? route.continue() : route.abort();
  });
  await page.route("http://127.0.0.1:8765/**", async route => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({status:204,headers:{
      "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"*",
      "Access-Control-Allow-Methods":"GET,PUT,OPTIONS",
    }});
    let status = 200;
    let body = {month:"2026-10",beneficiary_user_id:1,
      policy:{revision:0,effective_month:null,source:"legacy_confirmed_schedule",application_method:"flat_monthly_confirmed",rounding:"nearest_yen_half_up",
        tiers:Array.from({length:21},(_,index)=>({threshold_yen:index===0?0:500000+(index-1)*50000,rate_percent:40+index}))},working_manager_shift_ids:[1,2],
      open_working_manager_shift_ids:[],unassigned_shift_ids:[],eligible_revenue_yen:100000,
      working_manager_revenue_known_yen:100000,tier_rate_percent:40,next_tier:null,
      gross_share_yen:40000,payable_yen:null,blockers:["staff_payroll_costs_unavailable"]};
    if (req.method() !== "GET") {
      writes.push(req.postDataJSON());
      status = fail ? 503 : 200;
      body = fail ? {detail:"Simulated save failure"} : {};
    } else if (req.url().includes("working-manager-history")) body = [];
    await route.fulfill({status,json:body,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  await page.route("**/pay-preview-fixture", route => route.fulfill({
    contentType:"text/html",body:`<html><div id="root"></div><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const {default:Preview} = await import('/src/pages/AdminManagerShare.tsx');
      import '/src/index.css';
      const people=[{id:1,name:'Chuck',role:'manager'},{id:2,name:'Nori',role:'manager'}];
      const shifts=[1,2].map(id=>({id,business_date:'2026-10-0'+id,status:'closed',
        paid_total:50000,opened_by:'Chuck',working_manager_user_id:1,working_manager_name:'Chuck'}));
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Preview,{
        person:people[0],month:'2026-10',locale:${JSON.stringify(locale)},shifts,managers:people,
        refreshVersion:0,onRefresh:()=>{}
      }));
    </script></html>`,
  }));
  await page.goto("/pay-preview-fixture");
  return {writes, allowSave:()=>{fail=false;}};
}

for (const locale of ["en","ja"]) {
  test("pay summary precedes corrections and preserves failed drafts: " + locale, async ({page}) => {
    await page.setViewportSize({width:375,height:812});
    const state = await previewFixture(page, locale);
    const ja = locale === "ja";
    await expect(page.getByText("¥40,000",{exact:true})).toBeVisible();
    const summary = page.getByRole("heading",{name:ja ? "給与の見積もり" : "Pay estimate"});
    const shifts = page.getByRole("heading",{name:ja ? "担当シフト" : "Qualifying shifts"});
    expect((await summary.boundingBox()).y).toBeLessThan((await shifts.boundingBox()).y);
    await expect(page.locator("select")).toHaveCount(0);
    const correct = ja ? "担当を修正" : "Correct assignment";
    await page.getByRole("button",{name:correct,exact:true}).first().click();
    await expect(page.locator("select")).toHaveCount(1);
    await page.locator("select").selectOption("2");
    await page.getByRole("textbox").fill("Verified source correction");
    await page.getByRole("button",{name:correct,exact:true}).click();
    await expect(page.locator("select")).toHaveCount(1);
    await page.getByRole("button",{name:correct,exact:true}).click();
    await expect(page.locator("select")).toHaveValue("2");
    await expect(page.getByRole("textbox")).toHaveValue("Verified source correction");
    expect(state.writes).toEqual([]);
    const save = page.getByRole("button",{name:ja ? "担当を保存" : "Save assignment",exact:true});
    await save.click();
    await expect(page.getByRole("alert")).toHaveText("Simulated save failure");
    await expect(page.getByRole("textbox")).toHaveValue("Verified source correction");
    expect(state.writes).toHaveLength(1);
    state.allowSave();
    await save.click();
    await expect(page.locator("select")).toHaveCount(0);
    expect(state.writes).toHaveLength(2);
    expect(state.writes[0]).toEqual(state.writes[1]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
