import {test, expect} from "@playwright/test";
const API = "http://127.0.0.1:8765";

async function fixture(page, {locale = "en", id = 7, incomplete = false} = {}) {
  const calls = [];
  const role = id === 901 || id === 902 ? "manager" : "staff";
  await page.addInitScript(({locale}) => {
    localStorage.setItem("barticket_token","ISOLATED_PROFILE_TEST");
    localStorage.setItem("barticket_locale",locale);
  }, {locale});
  await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.route(API + "/**", async route => {
    const req = route.request(), url = new URL(req.url());
    if(req.method() === "OPTIONS") return route.fulfill({status:204,headers:{
      "Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,OPTIONS",
    }});
    calls.push(req.method()+" "+url.pathname);
    let body = {}, status = 200;
    const month = url.searchParams.get("month");
    if(url.pathname === "/auth/me") body = {id,name:"Fixture user",email:"profile@example.invalid",role,has_password:true};
    else if(url.pathname === "/menu") body = {items:[]};
    else if(url.pathname === "/shifts/current") body = {id:99,business_date:"2026-10-30",status:"open",opened_at:1793347200,opened_by:"Fixture",closed_at:null,closed_by:null,paid_total:0,cash_total:0,card_total:0,other_total:0,cover_total:0,guest_count:0,paid_count:0,cancelled_count:0,staff_hours:[],punches:[]};
    else if(url.pathname === "/venue-status") body={business_date:"2026-10-30",status:"open",event_value:null,updated_by:null,updated_at:null};
    else if(url.pathname === "/notices") body = {notices:[]};
    else if(url.pathname === "/profile/work-history") body = {user_id:id,shifts:[{shift_id:98,business_date:"2026-10-20",status:"closed",hours_seconds:null,historical_hours_seconds:null,hours_basis:"clock",hours_state:"unavailable",clocked_in:false,drinks:[{name:"季節限定の国産柚子と生姜の特製カクテル",quantity:2}]}]};
    else if(url.pathname === "/profile/nori-monthly-pay") {body={user_id:id,month,preview_only:true,coverage:"recorded_inputs_only",payment_records_available:false,own_income:{amount_yen:null,status:"unavailable",blockers:["owner_income_rule_unconfirmed"],source:null},staff_owed:[{payee:"chuck",user_id:901,name:"Chuck",amount_yen:27000,status:"estimate",blockers:[],source:"chuck_monthly_pay_preview"},{payee:"haruka",user_id:903,name:"Haruka",amount_yen:0,status:"estimate",blockers:[],source:"personal_earnings_preview"},{payee:"kanata",user_id:904,name:"Kanata",amount_yen:null,status:"incomplete",blockers:["staff_hourly_rate_missing"],source:"personal_earnings_preview"}],note:"Fixture"};}
    else if(url.pathname === "/profile/earnings") body = {user_id:id,month,preview_only:true,note:"Estimate only, not paid wages.",categories:[
      {category:"hourly_wages",amount_yen_unrounded:incomplete ? null : "13000",complete:!incomplete,entries:[]},
      {category:"staff_drink_bonus",amount_yen:0,complete:true,entries:[]},
    ]};
    else if(url.pathname === "/profile/chuck-monthly-pay") body = {user_id:id,month,preview_only:true,complete:!incomplete,
      gross_salary_yen:40000,staff_cost_total_yen:incomplete ? null : 13000,deduction_total_yen:0,
      net_amount_owed_yen:incomplete ? null : 27000,staff_owed:[],deductions:[],
      blockers:incomplete ? ["staff_hourly_rate_missing"] : [],note:"This is a pay estimate, not a payment record."};
    else if(url.pathname === "/analytics/shifts") body=[];
    else if(url.pathname === "/analytics/service-sales") body={basis:"original_service_business_date",days:[]};
    else if(url.pathname === "/realtime/events") body={events:[],cursor:0};
    else {status=404;body={detail:"Unmocked read"};}
    await route.fulfill({status,json:body,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  await page.goto("/profile");
  return calls;
}


for(const id of [7,901,902])for(const locale of ["en","ja"])for(const width of [320,1280])test("integrated profile matrix "+id+" "+locale+" "+width,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 await page.clock.install({time:new Date("2026-10-31T00:00:00Z")});
 const calls=await fixture(page,{locale,id,incomplete:true});
 const ja=locale==="ja";
 const sections=page.getByRole("group",{name:ja?"プロフィール表示":"Profile sections"});
 await expect(sections.getByRole("button",{name:ja?"給与":"My pay",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(page.getByRole("button",{name:ja?"更新":"Refresh",exact:true})).toBeEnabled();
 const expected=id===7?"/profile/earnings":id===901?"/profile/chuck-monthly-pay":"/profile/nori-monthly-pay";
 expect(calls).toContain("GET "+expected);
 for(const endpoint of ["/profile/earnings","/profile/chuck-monthly-pay","/profile/nori-monthly-pay"].filter(x=>x!==expected))expect(calls).not.toContain("GET "+endpoint);
 expect(calls).not.toContain("GET /analytics/shifts");
 if(id===7){
  await expect(page.getByText(ja?"月間給与の見積もり":"Monthly pay estimate",{exact:true}).locator("..").locator("strong")).toHaveText("—");
  await expect(page.getByText(ja?"スタッフドリンク手当":"Staff-drink bonus",{exact:true}).locator("..").locator("strong")).toHaveText(/[¥￥]0/);
 }else if(id===901){
  await expect(page.getByText(ja?"Chuckへの支払予定額":"Amount owed to Chuck",{exact:true}).locator("..").locator("strong")).toHaveText("—");
 }else{
  await expect(page.getByText(ja?"Noriの収入":"Nori's income",{exact:true}).locator("..").locator("strong")).toHaveText("—");
  await expect(page.getByText("Haruka",{exact:true}).locator("../..")).toContainText(/[¥￥]0/);
  await expect(page.getByText("Kanata",{exact:true}).locator("../..")).toContainText("—");
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath("pay.png"),fullPage:true});
 for(const [section,label]of [["history",ja?"勤務履歴":"Work history"],["shift",ja?"勤務":"Shift"],["account",ja?"アカウント設定":"Account settings"]]){
  await sections.getByRole("button",{name:label,exact:true}).click();
  await expect(page).toHaveURL(new RegExp("section="+section));
  if(section==="history"){
   await expect(page.getByRole("tab",{name:ja?"勤務時間":"Hours",exact:true})).toBeVisible();
   await expect(page.getByText(ja?"記録された勤務時間":"Recorded hours",{exact:true}).locator("..").locator("strong")).toHaveText("—");
  }
  if(section==="shift")await expect(page.getByRole("heading",{name:ja?"自分のタイムカード":"My Time Clock",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(section+".png"),fullPage:true});
 }
 expect(calls.filter(x=>!x.startsWith("GET "))).toEqual([]);
});
