import {test, expect} from "@playwright/test";

const baseReport = {
  user_id:902,month:"2026-10",preview_only:true,coverage:"recorded_inputs_only",payment_records_available:false,
  own_income:{amount_yen:null,status:"unavailable",blockers:["owner_income_rule_unconfirmed"],source:null},
  staff_owed:[
    {payee:"chuck",user_id:901,name:"Chuck",amount_yen:27000,status:"estimate",blockers:[],source:"chuck_monthly_pay_preview"},
    {payee:"haruka",user_id:903,name:"Haruka",amount_yen:0,status:"estimate",blockers:[],source:"personal_earnings_preview"},
    {payee:"kanata",user_id:null,name:null,amount_yen:null,status:"unavailable",blockers:["payee_identity_not_configured"],source:null},
  ],
  note:"Estimates from recorded inputs; not payment records.",
};
async function fixture(page,{locale="en",status=200,report={},delayed=false}={}) {
  // Keep monthly fixtures and screenshots independent of the machine date.
  await page.clock.install({time:new Date("2026-10-31T00:00:00Z")});
  const calls=[];
  await page.addInitScript(locale=>{
    localStorage.setItem("barticket_token","ISOLATED_NORI_PROFILE");
    localStorage.setItem("barticket_locale",locale);
  },locale);
  await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  let requests=0;
  let firstMonth=null;
  await page.route("http://127.0.0.1:8765/**",async route=>{
    const req=route.request(),url=new URL(req.url());
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{
      "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,OPTIONS",
    }});
    calls.push(req.method()+" "+url.pathname+url.search);
    let body={},code=200;
    if(url.pathname==="/auth/me")body={id:902,name:"Nori",role:"manager",email:"owner@example.invalid",has_password:true};
    else if(url.pathname==="/menu")body={items:[]};
    else if(url.pathname==="/shifts/current")body=null;
    else if(url.pathname==="/notices")body={notices:[]};
    else if(url.pathname==="/realtime/events")body={events:[],cursor:0};
    else if(url.pathname==="/profile/nori-monthly-pay"){
      requests++;
      firstMonth ??= url.searchParams.get("month");
      if(delayed && url.searchParams.get("month")===firstMonth)await gate;
      code=status;
      body=status===200?{...baseReport,month:url.searchParams.get("month"),...report}:{detail:"Fixture unavailable"};
      if(delayed && url.searchParams.get("month")!==firstMonth && status===200){
        body.staff_owed=structuredClone(baseReport.staff_owed);
        body.staff_owed[0].amount_yen=98765;
      }
    }else{code=404;body={detail:"Unexpected read"};}
    await route.fulfill({status:code,json:body,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  await page.goto("/profile");
  return {calls,release};
}
for(const locale of ["en","ja"]){
  test("Nori sees server estimates and explicit unavailable income: "+locale,async({page},testInfo)=>{
    await page.setViewportSize({width:375,height:812});
    const {calls}=await fixture(page,{locale});
    const ja=locale==="ja",region=page.getByRole("region",{name:ja?"Noriの月次サマリー":"Nori's monthly summary"});
    await expect(region.getByText(ja?"スタッフ給与差引後の残額":"Remaining after staff earnings",{exact:true}).locator("..").locator("strong")).toHaveText("—");
    await expect(region.getByText("Chuck",{exact:true}).locator("../..")).toContainText(/[¥￥]27,000/);
    await expect(region.getByText("Haruka",{exact:true}).locator("../..")).toContainText(/[¥￥]0/);
    await expect(region.getByText("Kanata",{exact:true}).locator("../..")).toContainText("—");
    await expect(region.getByText(ja?"金額を比較":"Compare amounts",{exact:true})).toHaveCount(0);
    await expect(region.getByRole("button",{name:ja?"更新":"Refresh",exact:true})).toHaveCount(1);
    expect(calls.some(x=>x.includes("/profile/earnings")||x.includes("/profile/chuck-monthly-pay"))).toBe(false);
    expect(calls.filter(x=>!x.startsWith("GET "))).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("nori-summary.png")});
  });
}
test("Nori comparison uses exact server amounts without inferring owner income",async({page})=>{
  const rows=structuredClone(baseReport.staff_owed);
  rows[2]={...rows[2],user_id:904,name:"Kanata",amount_yen:19501,status:"estimate",source:"personal_earnings_preview",blockers:[]};
  await fixture(page,{report:{staff_owed:rows}});
  const region=page.getByRole("region",{name:"Nori's monthly summary"});
  await region.getByText("Compare amounts",{exact:true}).click();
  await expect(region.getByRole("region",{name:"Estimated pay by person"})).toBeVisible();
  await expect(region.getByText("Remaining after staff earnings",{exact:true}).locator("..").locator("strong")).toHaveText("—");
  await expect(region.getByText("Kanata",{exact:true}).first().locator("../..")).toContainText("19,501");
});
for(const status of [403,404,503]){
  test("Nori summary fails closed without salary substitution: "+status,async({page})=>{
    const {calls}=await fixture(page,{status});
    await expect(page.getByRole("region",{name:"Nori's monthly summary"})).toBeVisible();
    await expect(page.getByText(status===403?"You don't have access to this information.":"The owner pay summary is not available yet.",{exact:true})).toBeVisible();
    await expect(page.getByText("27,000",{exact:false})).toHaveCount(0);
    expect(calls.some(x=>x.includes("/profile/earnings")||x.includes("/profile/chuck-monthly-pay"))).toBe(false);
  });
}
test("cross-user summary response is never rendered",async({page})=>{
  await fixture(page,{report:{user_id:901}});
  await expect(page.getByRole("alert")).toContainText("Could not load the latest data");
  await expect(page.getByText("27,000",{exact:false})).toHaveCount(0);
});
test("changing month rejects an older summary response",async({page})=>{
  const {calls,release}=await fixture(page,{delayed:true});
  await page.getByRole("button",{name:"Previous month",exact:true}).click();
  await expect(page.getByText("Chuck",{exact:true}).first()).toBeVisible();
  const monthCalls=calls.filter(x=>x.includes("/profile/nori-monthly-pay"));
  expect(new Set(monthCalls).size).toBe(2);
  const oldResponse=page.waitForResponse(response=>response.url().endsWith(monthCalls[0].split("?")[1]));
  release();
  await oldResponse;
  await expect(page.getByText("Chuck",{exact:true}).first().locator("../..")).toContainText("98,765");
});


test("users-only invalidation rechecks configured payees without changing owner or month",async({page})=>{
  let socket;
  await page.routeWebSocket("**/realtime/ws",peer=>{
    socket=peer;
    peer.onMessage(raw=>{if(JSON.parse(raw).type==="authenticate")peer.send(JSON.stringify({type:"ready",version:1,cursor:0}));});
  });
  const report={staff_owed:structuredClone(baseReport.staff_owed)};
  const {calls}=await fixture(page,{report});
  const region=page.getByRole("region",{name:"Nori's monthly summary"});
  await expect(region.getByText("Chuck",{exact:true}).locator("../..")).toContainText(/[¥￥]27,000/);
  const prior=calls.filter(path=>path.includes("/profile/nori-monthly-pay")).length;
  report.staff_owed[0]={payee:"chuck",user_id:901,name:"Chuck",amount_yen:null,status:"unavailable",
    blockers:["payee_identity_unavailable"],source:null};
  socket.send(JSON.stringify({type:"invalidate",version:1,cursor:1,scopes:["users"]}));
  await expect.poll(()=>calls.filter(path=>path.includes("/profile/nori-monthly-pay")).length).toBeGreaterThan(prior);
  const chuck=region.getByText("Chuck",{exact:true}).locator("../..");
  await expect(chuck).toContainText("—");
  await expect(chuck).toContainText("The payee account could not be verified.");
  await expect(region).not.toContainText(/[¥￥]27,000/);
  expect(calls.filter(path=>path.includes("/profile/nori-monthly-pay")).every(path=>path.includes("month=2026-10"))).toBe(true);
  expect(calls.filter(path=>!path.startsWith("GET "))).toEqual([]);
});

const completeIncome = {
  amount_yen:350000,status:"estimate",complete:true,blockers:[],
  source:"monthly_revenue_less_recorded_staff_earnings",basis:"before_other_expenses",
  revenue_yen:500000,staff_earnings_yen:150000,chuck_net_earnings_yen:27000,
  hourly_staff_earnings_yen:120000,recorded_staff_tips_commissions_yen:3000,
  other_manager_deductions_excluded_yen:5000,
};
for(const locale of ["en","ja"]) for(const width of [320,1280]) {
  test(`owner remainder is server-authoritative and before expenses ${locale} ${width}`,async({page},testInfo)=>{
    await page.setViewportSize({width,height:850});
    const {calls}=await fixture(page,{locale,report:{own_income:completeIncome}});
    const ja=locale==="ja",region=page.getByRole("region",{name:ja?"Noriの月次サマリー":"Nori's monthly summary"});
    const income=region.getByText(ja?"スタッフ給与差引後の残額":"Remaining after staff earnings",{exact:true}).locator("..");
    await expect(income.locator("strong")).toHaveText(/[¥￥]350,000/);
    await expect(income).toContainText(ja?"その他の経費を差し引く前":"Before other expenses");
    await expect(income).toContainText(ja?"利益や支払いの記録ではありません":"not profit or a payment record");
    // The named cards are not the full payroll: no client-side subtraction from those three.
    await region.getByText(ja?"見積もりの情報源":"Estimate sources",{exact:true}).click();
    await expect(region.getByText(ja?"全スタッフの給与・手当":"All staff earnings",{exact:true}).locator("..")).toContainText(/[¥￥]150,000/);
    await expect(region.getByText(ja?"記録された売上":"Recorded revenue",{exact:true}).locator("..")).toContainText(/[¥￥]500,000/);
    await expect(region).toContainText(ja?"現金の受取額や使える残高ではありません":"not cash received or an available balance");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(calls.filter(x=>!x.startsWith("GET "))).toEqual([]);
    await page.screenshot({path:testInfo.outputPath("owner-remainder.png"),fullPage:true});
  });
}
for(const amount of [0,-25000]) test(`owner remainder preserves signed amount ${amount}`,async({page})=>{
  await fixture(page,{report:{own_income:{...completeIncome,amount_yen:amount}}});
  const value=page.getByText("Remaining after staff earnings",{exact:true}).locator("..").locator("strong");
  await expect(value).toHaveText(amount===0?/[¥￥]0/:/-[¥￥]25,000/);
});
for(const override of [
  {status:"incomplete",complete:false,blockers:["staff_payroll_costs_incomplete"]},
  {basis:undefined}, {source:null}, {amount_yen:0,complete:false},
  {blockers:["staff_hours_unverified"]}, {amount_yen:9007199254740992},
]) test(`unverified owner remainder is never shown ${JSON.stringify(override)}`,async({page})=>{
  await fixture(page,{report:{own_income:{...completeIncome,...override}}});
  await expect(page.getByText("Remaining after staff earnings",{exact:true}).locator("..").locator("strong")).toHaveText("—");
});

test("owner remainder updates from server while preserving month and sources disclosure",async({page})=>{
  let socket;
  await page.routeWebSocket("**/realtime/ws",peer=>{socket=peer;peer.onMessage(raw=>{
    if(JSON.parse(raw).type==="authenticate")peer.send(JSON.stringify({type:"ready",version:1,cursor:0}));
  });});
  const report={own_income:{...completeIncome}};
  await fixture(page,{report});
  await page.getByRole("button",{name:"Previous month",exact:true}).click();
  const region=page.getByRole("region",{name:"Nori's monthly summary"});
  await expect(region.getByText("September 2026",{exact:true})).toBeVisible();
  const details=region.locator("details").filter({hasText:"Estimate sources"});
  await details.locator("summary").click();
  const value=region.getByText("Remaining after staff earnings",{exact:true}).locator("..").locator("strong");
  await expect(value).toHaveText(/[¥￥]350,000/);
  report.own_income={...completeIncome,amount_yen:325000,staff_earnings_yen:175000};
  socket.send(JSON.stringify({type:"invalidate",version:1,cursor:1,scopes:["analytics"]}));
  await expect(value).toHaveText(/[¥￥]325,000/);
  await expect(details).toHaveAttribute("open","");
  await expect(region.getByText("September 2026",{exact:true})).toBeVisible();
});

test("historical correction can withdraw an estimate without inventing zero or changing the month",async({page})=>{
  const report={own_income:{...completeIncome}};
  const {calls}=await fixture(page,{report});
  const region=page.getByRole("region",{name:"Nori's monthly summary"});
  await region.getByRole("button",{name:"Previous month",exact:true}).click();
  const value=region.getByText("Remaining after staff earnings",{exact:true}).locator("..").locator("strong");
  await expect(value).toHaveText(/[¥￥]350,000/);
  const details=region.locator("details").filter({hasText:"Estimate sources"});
  await details.locator("summary").click();
  report.own_income={...completeIncome,amount_yen:null,status:"incomplete",complete:false,
    staff_earnings_yen:null,blockers:["staff_hours_unverified"]};
  await region.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(value).toHaveText("—");
  await expect(region).toContainText("Work hours need verification.");
  await expect(details).toHaveAttribute("open","");
  await expect(region.getByText("September 2026",{exact:true})).toBeVisible();
  // A verified correction/reversal may legitimately produce a signed remainder.
  report.own_income={...completeIncome,amount_yen:-25000,staff_earnings_yen:525000};
  await region.getByRole("button",{name:"Refresh",exact:true}).click();
  await expect(value).toHaveText(/-[¥￥]25,000/);
  expect(calls.filter(x=>!x.startsWith("GET "))).toEqual([]);
});
