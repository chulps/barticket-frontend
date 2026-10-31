import { test, expect } from "@playwright/test";

async function previewFixture(page, locale = "en", canEdit = true, hasPolicy = true) {
  const writes = [];
  let fail = true;
  const tiers=[{threshold_yen:0,rate_percent:45},{threshold_yen:100000,rate_percent:55},{threshold_yen:200000,rate_percent:65}];
  const policy={revision:4,effective_month:"2026-10",tiers,application_method:"flat_monthly_confirmed",rounding:"nearest_yen_half_up"};
  const policies={beneficiary_user_id:1,owner_user_id:2,can_edit:canEdit,revision:4,current_month:"2026-10",earliest_effective_month:"2026-11",legacy_policy:policy,versions:[]};
  let reads=0,saveStatus=200,readStatus=200,abortWrite=false,readWait=null,writeWait=null;
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
    if(req.url().includes("/payroll/revenue-share/policies")){
      reads++;
      const readSnapshot=readStatus;
      if(req.method()==="GET" && readWait){const wait=readWait;readWait=null;await wait;}
      if(req.method()==="GET" && readSnapshot!==200)return route.fulfill({status:readSnapshot,json:{detail:"Forbidden"},headers:{"Access-Control-Allow-Origin":"*"}});
      if(req.method()==="POST"){
        writes.push(req.postDataJSON());
        if(writeWait){const wait=writeWait;writeWait=null;await wait;}
        if(abortWrite)return route.abort("failed");
        if(saveStatus!==200)return route.fulfill({status:saveStatus,json:{detail:"Revision conflict"},headers:{"Access-Control-Allow-Origin":"*"}});
        policies.revision++;
        policies.versions.unshift({...req.postDataJSON(),revision:policies.revision,created_by_name:"Nori",created_at:"2026-10-31T00:00:00Z",supersedes_revision:null});
      }
      return route.fulfill({json:policies,headers:{"Access-Control-Allow-Origin":"*"}});
    }
    let status = 200;
    let body = {month:"2026-10",beneficiary_user_id:1,working_manager_shift_ids:[1,2],
      open_working_manager_shift_ids:[],unassigned_shift_ids:[],eligible_revenue_yen:100000,
      working_manager_revenue_known_yen:100000,tier_rate_percent:55,next_tier:null,
      gross_share_yen:40000,payable_yen:null,policy:hasPolicy?policy:undefined,blockers:["staff_payroll_costs_unavailable"]};
    if (req.method() !== "GET") {
      writes.push(req.postDataJSON());
      status = fail ? 503 : 200;
      body = fail ? {detail:"Simulated save failure"} : {};
    } else if (req.url().includes("working-manager-history")) body = [];
    await route.fulfill({status,json:body,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  await page.route("**/pay-preview-fixture", route => route.fulfill({
    contentType:"text/html",body:`<html><style>*{scroll-behavior:auto!important}</style><div id="root"></div><script type="module">
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
  return {writes,denyReads:()=>{readStatus=403;},denyWrite:()=>{saveStatus=403;},abortWrite:()=>{abortWrite=true;},holdRead:()=>{let release;readWait=new Promise(resolve=>{release=resolve;});return ()=>release();},holdWrite:()=>{let release;writeWait=new Promise(resolve=>{release=resolve;});return ()=>release();},reads:()=>reads,invalid:()=>{saveStatus=422;},conflict:()=>{saveStatus=409;},allowSave:()=>{saveStatus=200;fail=false;}};
}


for(const locale of ["en","ja"])test(`future policy edit stays explicit and sends unchanged tiers: ${locale}`,async({page})=>{
 const ja=locale==="ja";await page.setViewportSize({width:375,height:812});const state=await previewFixture(page,locale);
 await expect(page.getByText("¥40,000",{exact:true})).toBeVisible();expect(state.reads()).toBe(0);expect(state.writes).toEqual([]);
 await page.locator("summary").filter({hasText:ja?"歩合給の方針と履歴":"Revenue-share policy and history"}).click();
 const action=page.getByRole("button",{name:ja?"将来の方針を設定":"Schedule a future policy",exact:true});await expect(action).toBeVisible();
 await expect(page.locator('input[type="month"]')).toHaveCount(0);await action.click();
 const month=page.locator('input[type="month"]');await expect(month).toHaveValue("");await expect(month).toHaveAttribute("min","2026-11");
 await page.getByRole("textbox",{name:ja?"変更理由":"Reason",exact:true}).fill("Confirmed future agreement");
 await page.getByRole("textbox",{name:ja?"合意・根拠":"Agreement or source",exact:true}).fill("Owner agreement reference");
 const save=page.getByRole("button",{name:ja?"将来の方針を保存":"Save future policy",exact:true});
 await month.fill("2026-10");await expect(save).toBeDisabled();await month.fill("2026-11");await expect(save).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/barticket-policy-editor-${locale}.png`,fullPage:true});
 await save.click();await expect(page.getByRole("status")).toContainText(ja?"将来の方針を保存しました。":"Future policy saved.");
 expect(state.writes).toEqual([{effective_month:"2026-11",tiers:[{threshold_yen:0,rate_percent:45},{threshold_yen:100000,rate_percent:55},{threshold_yen:200000,rate_percent:65}],reason:"Confirmed future agreement",source:"Owner agreement reference",expected_revision:4}]);
});
test("policy readers see history but no scheduling control",async({page})=>{
 const state=await previewFixture(page,"en",false);await page.locator("summary").filter({hasText:"Revenue-share policy and history"}).click();
 await expect(page.getByRole("heading",{name:"Policy history",exact:true})).toBeVisible();
 await expect(page.getByRole("button",{name:"Schedule a future policy",exact:true})).toHaveCount(0);expect(state.writes).toEqual([]);
});
test("conflicting policy save locks its draft and requires explicit reload without replay",async({page})=>{
 const state=await previewFixture(page);await page.locator("summary").filter({hasText:"Revenue-share policy and history"}).click();
 await page.getByRole("button",{name:"Schedule a future policy",exact:true}).click();await page.locator('input[type="month"]').fill("2026-11");
 await page.getByRole("textbox",{name:"Reason",exact:true}).fill("Reason");await page.getByRole("textbox",{name:"Agreement or source",exact:true}).fill("Source");
 state.conflict();await page.getByRole("button",{name:"Save future policy",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Save could not be confirmed");
 await expect(page.getByRole("button",{name:"Save future policy",exact:true})).toBeDisabled();expect(state.writes).toHaveLength(1);
 await page.getByRole("button",{name:"Reload policy history",exact:true}).click();await expect(page.getByRole("button",{name:"Schedule a future policy",exact:true})).toBeVisible();expect(state.writes).toHaveLength(1);
});
test("tier explanation renders the selected server policy instead of the legacy ladder",async({page})=>{
 await previewFixture(page);await page.locator("summary").filter({hasText:"Qualifying sales and rate details"}).click();
 await page.getByRole("button",{name:"View tier schedule",exact:true}).click();
 const table=page.getByRole("table");await expect(table).toContainText("45%");await expect(table).toContainText("65%");await expect(table).not.toContainText("60%");
});

test("server validation rejection keeps the explicit draft editable",async({page})=>{
 const state=await previewFixture(page);await page.locator("summary").filter({hasText:"Revenue-share policy and history"}).click();
 await page.getByRole("button",{name:"Schedule a future policy",exact:true}).click();await page.locator('input[type="month"]').fill("2026-11");
 await page.getByRole("textbox",{name:"Reason",exact:true}).fill("Reason");await page.getByRole("textbox",{name:"Agreement or source",exact:true}).fill("Source");
 state.invalid();const save=page.getByRole("button",{name:"Save future policy",exact:true});await save.click();
 await expect(page.getByRole("alert")).toContainText("schedule was rejected");await expect(save).toBeEnabled();expect(state.writes).toHaveLength(1);
 state.allowSave();await save.click();await expect(page.getByRole("status")).toContainText("Future policy saved.");expect(state.writes).toHaveLength(2);
});

test("missing verified policy cannot show a legacy ladder or prefill a future schedule",async({page})=>{
 await previewFixture(page,"en",true,false);await page.locator("summary").filter({hasText:"Qualifying sales and rate details"}).click();
 await expect(page.getByRole("button",{name:"View tier schedule",exact:true})).toBeDisabled();await expect(page.getByRole("table")).toHaveCount(0);
 await page.locator("summary").filter({hasText:"Revenue-share policy and history"}).click();await expect(page.getByRole("button",{name:"Schedule a future policy",exact:true})).toBeDisabled();
});
async function draft(page){
 await page.locator("summary").filter({hasText:"Revenue-share policy and history"}).click();await page.getByRole("button",{name:"Schedule a future policy",exact:true}).click();
 await page.locator('input[type="month"]').fill("2026-11");await page.getByRole("textbox",{name:"Reason",exact:true}).fill("Reason");await page.getByRole("textbox",{name:"Agreement or source",exact:true}).fill("Source");
}
async function switchAccount(page){await page.evaluate(()=>{localStorage.setItem("barticket_token","POLICY_OTHER_ACCOUNT");dispatchEvent(new Event("barticket-auth"));});}
test("late owner policy read cannot restore controls after session access changes",async({page})=>{
 const state=await previewFixture(page),release=state.holdRead();await page.locator("summary").filter({hasText:"Revenue-share policy and history"}).click();await expect.poll(state.reads).toBe(1);
 state.denyReads();await switchAccount(page);await expect(page.getByRole("alert")).toContainText("access is not permitted");release();await page.waitForLoadState("networkidle");
 await expect(page.getByRole("button",{name:"Schedule a future policy",exact:true})).toHaveCount(0);expect(state.writes).toEqual([]);
});
test("late policy save cannot show success in a different session",async({page})=>{
 const state=await previewFixture(page);await draft(page);const release=state.holdWrite();await page.getByRole("button",{name:"Save future policy",exact:true}).click();await expect.poll(()=>state.writes.length).toBe(1);
 state.denyReads();await switchAccount(page);await expect(page.getByRole("alert")).toContainText("access is not permitted");release();await page.waitForLoadState("networkidle");
 await expect(page.getByText("Future policy saved.",{exact:true})).toHaveCount(0);expect(state.writes).toHaveLength(1);
});
for(const kind of ["denied","ambiguous"])test(`policy ${kind} write never replays`,async({page})=>{
 const state=await previewFixture(page);await draft(page);if(kind==="denied")state.denyWrite();else state.abortWrite();await page.getByRole("button",{name:"Save future policy",exact:true}).click();
 await expect(page.getByRole("alert")).toContainText(kind==="denied"?"access is not permitted":"Save could not be confirmed");
 if(kind==="denied")await expect(page.getByRole("button",{name:"Save future policy",exact:true})).toHaveCount(0);else await expect(page.getByRole("button",{name:"Save future policy",exact:true})).toBeDisabled();
 expect(state.writes).toHaveLength(1);
});
