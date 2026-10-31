import { test, expect } from "@playwright/test";

async function previewFixture(page, locale = "en", override = {}) {
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
      gross_share_yen:40000,payable_yen:null,blockers:["staff_payroll_costs_unavailable"],...override};
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
  await page.waitForLoadState("networkidle");
  return {writes, allowSave:()=>{fail=false;}};
}

const verified={complete:true,payable_yen:27654,costs:{staff_base_wages_yen:11111,staff_drinkback_yen:2222,deductions_yen:-987,approved_additions_yen:null},blockers:[]};
for(const locale of ["en","ja"])test(`verified share costs use server amounts without recomputing: ${locale}`,async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const state=await previewFixture(page,locale,verified),ja=locale==="ja";
 const amount=page.getByText(ja?"支給見積額":"Amount owed (estimate)",{exact:true}).first().locator("..");
 await expect(amount).toContainText("¥27,654");
 const costs=page.locator("details").filter({has:page.locator("summary",{hasText:ja?"費用・調整額の内訳":"Costs and adjustments"})});
 await expect(costs.getByText("¥11,111",{exact:true})).toBeHidden();
 await costs.locator("summary").click();
 await expect(costs.getByText("¥11,111",{exact:true})).toBeVisible();
 await expect(costs.getByText("¥2,222",{exact:true})).toBeVisible();
 await expect(costs.getByText("¥-987",{exact:true})).toBeVisible();
 await expect(costs.getByText("¥27,654",{exact:true})).toBeVisible();
 await expect(costs.getByText(ja?"承認済み加算":"Approved additions",{exact:true}).locator("..")).toContainText("—");
 expect(state.writes).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
for(const override of [{...verified,complete:false,blockers:["staff_payroll_costs_unavailable"]},{...verified,beneficiary_user_id:99},{...verified,month:"2026-09"}])test(`unverified or mismatched preview cannot present amount owed: ${JSON.stringify(override)}`,async({page})=>{
 await previewFixture(page,"en",override);
 const amount=page.getByText("Amount owed (estimate)",{exact:true}).first().locator("..");
 await expect(amount).toContainText("—");
 await expect(page.getByText("¥27,654",{exact:true})).toHaveCount(0);
});
