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
    else if(url.pathname === "/tickets") body=[];
    else if(url.pathname === "/menu") body = {items:[]};
    else if(url.pathname === "/shifts/current") body = null;
    else if(url.pathname === "/notices") body = {notices:[]};
    else if(url.pathname === "/profile/work-history") body = {user_id:id,shifts:[]};
    else if(url.pathname === "/profile/nori-monthly-pay") {status=404;body={detail:"Not deployed in this fixture"};}
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


for(const locale of ["en","ja"])test("Dashboard time clock link and Profile browser history "+locale,async({page})=>{
 const calls=await fixture(page,{locale});
 const ja=locale==="ja";
 const tabs=page.getByRole("group",{name:ja?"プロフィール表示":"Profile sections"});
 await expect(tabs.getByRole("button",{name:ja?"給与":"My pay",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.goto("/tickets");
 const link=page.getByRole("link",{name:ja?"タイムカードを見る":"View time clock"});
 await expect(link).toHaveAttribute("href","/profile?section=shift");
 await link.click();
 await expect(tabs.getByRole("button",{name:ja?"勤務":"Shift",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.goBack();
 await expect(page).toHaveURL(/\/tickets$/);
 await page.goForward();
 await expect(tabs.getByRole("button",{name:ja?"勤務":"Shift",exact:true})).toHaveAttribute("aria-pressed","true");
 await tabs.getByRole("button",{name:ja?"給与":"My pay",exact:true}).click();
 await expect(page).toHaveURL(/\/profile$/);
 await page.goBack();
 await expect(tabs.getByRole("button",{name:ja?"勤務":"Shift",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.goto("/profile?section=unknown&from=fixture");
 await expect(tabs.getByRole("button",{name:ja?"給与":"My pay",exact:true})).toHaveAttribute("aria-pressed","true");
 await tabs.getByRole("button",{name:ja?"勤務履歴":"Work history",exact:true}).click();
 await expect(page).toHaveURL(/section=history&from=fixture/);
 expect(calls.filter(call=>!call.startsWith("GET "))).toEqual([]);
});
