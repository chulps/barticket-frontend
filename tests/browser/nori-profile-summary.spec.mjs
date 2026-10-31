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
    await expect(region.getByText(ja?"Noriの収入":"Nori's income",{exact:true}).locator("..").locator("strong")).toHaveText("—");
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
  await expect(region.getByText("Nori's income",{exact:true}).locator("..").locator("strong")).toHaveText("—");
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
