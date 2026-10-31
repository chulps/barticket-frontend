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
    else if(url.pathname === "/shifts/current") body = null;
    else if(url.pathname === "/notices") body = {notices:[]};
    else if(url.pathname === "/profile/work-history") body = {user_id:id,shifts:[{shift_id:10,business_date:"2026-10-20",status:"closed",hours_seconds:7200,historical_hours_seconds:null,hours_basis:"time_clock",hours_state:"verified",clocked_in:false,drinks:[{name:"季節限定の国産柚子と香り豊かな生姜を使った特製ノンアルコールカクテル",quantity:2}]}]};
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


for(const locale of ["en","ja"]) for(const width of [320,1280]) {
 test("work history compact periods and long Japanese records "+locale+" "+width,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  const calls=await fixture(page,{locale});
  const ja=locale==="ja";
  await page.getByRole("group",{name:ja?"プロフィール表示":"Profile sections"}).getByRole("button",{name:ja?"勤務履歴":"Work history",exact:true}).click();
  const periods=page.getByRole("group",{name:ja?"表示期間":"Time scale"});
  await expect(periods).toBeVisible();
  const bounds=await periods.boundingBox();
  expect(bounds.width).toBeLessThan(400);
  for(const name of [ja?"年":"Year",ja?"月次":"Monthly",ja?"日次":"Daily",ja?"全期間":"All Time"]){
   await periods.getByRole("button",{name,exact:true}).click();
   await expect(periods.getByRole("button",{name,exact:true})).toHaveAttribute("aria-pressed","true");
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  const hours=page.getByRole("tab",{name:ja?"勤務時間":"Hours",exact:true});
  const drinks=page.getByRole("tab",{name:ja?"スタッフドリンク":"Staff drinks",exact:true});
  expect((await hours.boundingBox()).y).toBe((await drinks.boundingBox()).y);
  expect(await drinks.evaluate(button=>button.scrollWidth<=button.clientWidth)).toBe(true);
  await drinks.click();
  await periods.getByRole("button",{name:ja?"月次":"Monthly",exact:true}).click();
  await expect(page.getByText("季節限定の国産柚子と香り豊かな生姜を使った特製ノンアルコールカクテル × 2")).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(calls.filter(call=>!call.startsWith("GET "))).toEqual([]);
  expect(calls).not.toContain("GET /analytics/shifts");
  await page.screenshot({path:testInfo.outputPath("history.png"),fullPage:true});
 });
}
