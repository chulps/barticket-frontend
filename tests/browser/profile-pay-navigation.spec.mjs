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
    else if(url.pathname === "/profile/work-history") body = {user_id:id,shifts:[]};
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

for(const locale of ["en","ja"]) {
  test("direct pay and work destinations have one refresh at phone width: "+locale, async({page}, testInfo) => {
    await page.setViewportSize({width:375,height:812});
    const calls = await fixture(page,{locale,incomplete:true});
    const ja=locale==="ja";
    const sections=page.getByRole("group",{name:ja?"プロフィール表示":"Profile sections"});
    await expect(sections.getByRole("button",{name:ja?"給与":"My pay",exact:true})).toHaveAttribute("aria-pressed","true");
    for(const button of await sections.getByRole("button").all()) {
      const box=await button.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(375);
    }
    const total=page.getByText(ja?"月間給与の見積もり":"Monthly pay estimate",{exact:true}).locator("..");
    await expect(total.locator("strong")).toHaveText("—");
    const bonus=page.getByText(ja?"スタッフドリンク手当":"Staff-drink bonus",{exact:true}).locator("..");
    await expect(bonus.locator("strong")).toHaveText(/[¥￥]0/);
    await expect(page.getByRole("button",{name:ja?"更新":"Refresh",exact:true})).toHaveCount(1);
    await page.screenshot({path:testInfo.outputPath("my-pay-mobile.png")});
    expect(calls).not.toContain("GET /profile/work-history");
    await sections.getByRole("button",{name:ja?"勤務履歴":"Work history",exact:true}).click();
    await expect(page.getByRole("tab",{name:ja?"勤務時間":"Hours",exact:true})).toBeVisible();
    await expect(page.getByRole("tab",{name:"Income",exact:true})).toHaveCount(0);
    await expect(page.getByRole("button",{name:ja?"更新":"Refresh",exact:true})).toHaveCount(1);
    expect(calls).toContain("GET /profile/work-history");
    await sections.getByRole("button",{name:ja?"アカウント設定":"Account settings",exact:true}).click();
    await expect(page.getByRole("region",{name:ja?"アカウント設定":"Account settings"})).toBeVisible();
    expect(calls.filter(c=>!c.startsWith("GET "))).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test("Chuck pay leads with unavailable amount and blockers, statistics load only on request",async({page}, testInfo)=>{
  const calls=await fixture(page,{id:901,incomplete:true});
  const pay=page.getByRole("region",{name:"Chuck's monthly pay"});
  await expect(pay.getByText("Amount owed to Chuck",{exact:true}).locator("..").locator("strong")).toHaveText("—");
  await expect(pay.getByText("A staff hourly rate is missing.",{exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath("chuck-pay-summary.png")});
  expect(calls).not.toContain("GET /analytics/shifts");
  expect(calls).not.toContain("GET /analytics/service-sales");
  await expect(pay.getByRole("button",{name:"Refresh",exact:true})).toHaveCount(1);
  await pay.getByText("Managed-shift sales and guests",{exact:true}).click();
  await expect.poll(()=>calls.includes("GET /analytics/shifts")).toBe(true);
  await expect.poll(()=>calls.includes("GET /analytics/service-sales")).toBe(true);
  expect(calls).not.toContain("GET /profile/earnings");
  expect(calls.filter(c=>!c.startsWith("GET "))).toEqual([]);
});

test("Nori's unavailable owner summary does not substitute staff or Chuck pay",async({page})=>{
  const calls=await fixture(page,{id:902});
  await expect(page.getByRole("heading",{name:"Monthly owner summary"})).toBeVisible();
  await expect(page.getByText("Nori’s monthly summary will appear when the verified manager data is available.")).toBeVisible();
  expect(calls).not.toContain("GET /profile/earnings");
  expect(calls).not.toContain("GET /profile/chuck-monthly-pay");
});
