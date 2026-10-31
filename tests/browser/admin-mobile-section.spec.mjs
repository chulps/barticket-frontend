import {test,expect} from "@playwright/test";

const people=[
  {id:901,name:"Chuck",role:"manager",email:"chuck@example.invalid"},
  {id:902,name:"Nori",role:"manager",email:"nori@example.invalid"},
  {id:903,name:"Haruka with a very long family name for wrapping",role:"staff",email:"a-very-long-email-address-that-must-wrap-without-truncation@example.invalid"},
  {id:904,name:"Kanata",role:"staff",email:"kanata@example.invalid"},
];
async function mockTeam(page, locale="en") {
  const requests=[];
  await page.addInitScript(locale=>{
    localStorage.setItem("barticket_token","ISOLATED_TEAM_TEST");
    localStorage.setItem("barticket_locale",locale);
  },locale);
  await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
  await page.route("http://127.0.0.1:8765/**",async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,OPTIONS"}});
    requests.push({method:req.method(),path,search:url.search});
    let data=[],status=200;
    if(req.method()!=="GET"){status=405;data={detail:"No writes in this fixture"};}
    else if(path==="/auth/me")data=people[0];
    else if(path==="/users")data=people;
    else if(path==="/auth/status")data={has_accounts:true,google_enabled:false};
    else if(path==="/shifts/current")data=null;
    else if(path==="/menu")data={items:[],coverCharge:500};
    else if(path==="/notices")data={notices:[]};
    else if(path==="/admin/staff-compensation/chuck-monthly-pay")data={
      user_id:901,complete:true,blockers:[],gross_salary_yen:40000,staff_cost_total_yen:10000,
      deduction_total_yen:0,net_amount_owed_yen:30000,staff_owed:[],deductions:[],
    };
    else if(/\/earnings$/.test(path))data={user_id:Number(path.split("/")[4]),categories:[
      {category:"hourly_wages",complete:true,amount_yen_unrounded:"10000",amount_yen:10000},
      {category:"staff_drink_bonus",complete:true,amount_yen:400},
    ]};
    else if(path==="/admin/audit")data={person_user_id:903,events:[],has_more:false};
    else if(!["/analytics/shifts","/tickets"].includes(path)){status=404;data={detail:"Unused fixture path"};}
    await route.fulfill({status,json:data,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  return requests;
}

for(const locale of ["en","ja"])test(`mobile Admin section selector preserves navigation: ${locale}`,async({page})=>{
 const ja=locale==="ja", requests=await mockTeam(page,locale);
 await page.setViewportSize({width:390,height:900});
 await page.goto("/admin?teamView=pay&month=2026-09");
 const picker=page.getByRole("combobox",{name:ja?"管理メニュー":"Admin section",exact:true});
 await expect(picker).toHaveValue("team");
 await expect(picker.locator("option")).toHaveCount(7);
 await expect(page.getByRole("navigation",{name:ja?"管理セクション":"Admin sections"})).toBeHidden();
 expect(await picker.locator("..").evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(90);
 await picker.selectOption("accounts");
 await expect(page).toHaveURL(/\/admin$/);
 await page.goBack();
 await expect(picker).toHaveValue("team");
 await expect(page.getByRole("region",{name:ja?"月次給与一覧":"Monthly team pay",exact:true})).toBeVisible();
 await page.goForward();await expect(picker).toHaveValue("accounts");
 await picker.selectOption("payments");
 await expect(page.getByRole("heading",{name:ja?"決済設定":"Payment setup",exact:true})).toBeVisible();
 await picker.selectOption("overview");
 await page.screenshot({path:`/tmp/barticket-mobile-section-${locale}-390.png`,fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await expect(picker).toBeHidden();
 await expect(page.getByRole("navigation",{name:ja?"管理セクション":"Admin sections"}).getByRole("button",{name:ja?"概要":"Overview",exact:true})).toBeVisible();
 await page.screenshot({path:`/tmp/barticket-mobile-section-${locale}-1280.png`,fullPage:true});
 expect(requests.some(r=>r.method!=="GET")).toBe(false);
});
