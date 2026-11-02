import { test, expect } from "@playwright/test";
const row = (id, overrides = {}) => ({id,business_date:"2025-05-01",staff_name:"Former staff",user_id:null,
  duration_seconds:0,source_file:"Synthetic archive",source_row:id+1,source_column:"Hours",
  uncertainty:"Derived from source total; clock times unknown",verification_state:"verified",account_unlinked:true,...overrides});
async function fixture(page, ja, mode = "records") {
  const writes = []; let fail = mode === "error"; let pageFail = mode === "pageerror"; let resolve;
  await page.addInitScript(() => localStorage.setItem("barticket_token","SYNTHETIC_TOKEN"));
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.route("http://127.0.0.1:8765/**", async route => {
    const req=route.request();
    const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS"};
    if(req.method()==="OPTIONS") return route.fulfill({status:204,headers});
    if(req.method()!=="GET") {
      writes.push(new URL(req.url()).pathname);
      if(mode==="preview" && req.url().endsWith("/reconcile")) return route.fulfill({headers,json:{mode:"READ_ONLY_RECONCILIATION",source_file:"Synthetic.csv",row_count:1,
        counts:{match:0,new:0,conflict:0,duplicate_candidate:0,unmapped:0,already_imported:1,rejected:0},
        rows:[{...req.postDataJSON().rows[0],source_seconds:32400,clock_seconds:null,historical_seconds:null,effective_seconds:null,state:"already_imported",reason:"This source row has already been imported.",account_unlinked:true,stored_record:row(1)}]}});
    }
    if(mode==="delayed") await new Promise(r=>{resolve=r;});
    if(fail) { fail=false; return route.fulfill({status:503,headers,json:{detail:"Synthetic failure"}}); }
    const after=new URL(req.url()).searchParams.get("after_id");
    if(after === "1" && pageFail) { pageFail=false; return route.fulfill({status:503,headers,json:{detail:"Synthetic page failure"}}); }
    return route.fulfill({headers,json:{mode:"READ_ONLY_EXCEPTIONS",rows:mode==="empty"?[]:after==="0"?[row(1)]:[row(2,{duration_seconds:7200,uncertainty:null,verification_state:"pending"})],next_cursor:mode==="empty" || after!=="0"?null:1}});
  });
  await page.route("**/historical-fixture",route=>route.fulfill({contentType:"text/html",body:`<!doctype html><html lang="${ja?"ja":"en"}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    import '/src/index.css';
    const {default:Component}=await import('/src/pages/${mode==="preview"?"Reconciliation":"HistoricalHoursExceptions"}.tsx');
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component,{ja:${ja},locale:${JSON.stringify(ja?"ja":"en")},shifts:[],users:[],error:""}));
  </script></body></html>`}));
  await page.goto("/historical-fixture");
  return {writes,ready:()=>Boolean(resolve),release:()=>resolve?.()};
}
for (const ja of [false,true]) for(const width of [320,390,768]) {
  test(`stored exceptions preserve evidence and page safely ${ja} ${width}`,async({page},info)=>{
    await page.setViewportSize({width,height:900});
    const state=await fixture(page,ja);
    await expect(page.getByText(ja?"取り込み済み · アカウント未紐付け":"Imported · Account unlinked")).toBeVisible();
    await expect(page.getByText("0 h · "+(ja?"確認済み":"Verified"))).toBeVisible();
    await expect(page.getByText("Derived from source total; clock times unknown")).toBeVisible();
    await page.getByRole("button",{name:ja?"続きを表示":"Load more records"}).click();
    await expect(page.locator("li")).toHaveCount(2);
    await expect(page.getByText("2 h · "+(ja?"未確認":"Not verified"))).toBeVisible();
    await expect(page.getByText(ja?"記録なし。打刻時刻は不明です。":"Not recorded. Clock times are unknown.")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(state.writes).toEqual([]);
    await page.screenshot({path:info.outputPath("audit-historical-exceptions.png"),fullPage:true});
  });
}
test("empty is distinct from failed, and failure can retry",async({page})=>{
  await fixture(page,false,"empty");
  await expect(page.getByText("No stored unlinked records.")).toBeVisible();
  await page.unrouteAll({behavior:"wait"});
  await fixture(page,false,"error");
  await expect(page.getByRole("alert")).toContainText("Could not load records");
  await expect(page.getByText("No stored unlinked records.")).toHaveCount(0);
  await page.getByRole("button",{name:"Retry"}).click();
  await expect(page.locator("li")).toHaveCount(1);
});
test("session changes clear evidence and discard delayed reads",async({page})=>{
  const state=await fixture(page,false,"delayed");
  await expect(page.getByRole("status")).toContainText("Loading");
  await expect.poll(state.ready).toBe(true);
  await page.evaluate(()=>{localStorage.removeItem("barticket_token");window.dispatchEvent(new Event("barticket-auth"));});
  state.release();
  await expect(page.getByRole("status")).toContainText("Session changed");
  await expect(page.locator("li")).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

for (const width of [390,768]) test("CSV imported unlinked evidence keeps stored identity " + width,async({page})=>{
  await page.setViewportSize({width,height:900});
  const state=await fixture(page,false,"preview");
  await page.locator('input[type="file"]').setInputFiles({name:"Synthetic.csv",mimeType:"text/csv",buffer:Buffer.from("Date,Staff,Hours\n2025-06-12,Changed uploaded identity,9")});
  await page.getByRole("button",{name:"Reconcile staff hours",exact:true}).click();
  const results=width<700?page.getByRole("list",{name:"Staff-hours reconciliation results"}):page.locator("table").filter({has:page.getByRole("columnheader",{name:"Current effective hours"})});
  await expect(results).toContainText("Changed uploaded identity");
  await expect(results).toContainText("Imported · Account unlinked");
  await expect(results).toContainText("Former staff");
  await expect(results).toContainText("2025-05-01");
  await expect(results).toContainText("Unknown");
  await expect(results.getByRole("checkbox")).toBeDisabled();
  await expect(page.getByRole("button",{name:"Save selected hours (0)",exact:true})).toBeDisabled();
  expect(state.writes).toEqual(["/historical-hours/reconcile"]);
});

test("pagination retry retains the first page and resumes the same cursor",async({page})=>{
  await fixture(page,false,"pageerror");
  await expect(page.locator("li")).toHaveCount(1);
  await page.getByRole("button",{name:"Load more records"}).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.locator("li")).toHaveCount(1);
  await page.getByRole("button",{name:"Retry"}).click();
  await expect(page.locator("li")).toHaveCount(2);
  await expect(page.getByRole("button",{name:"Load more records"})).toHaveCount(0);
});
