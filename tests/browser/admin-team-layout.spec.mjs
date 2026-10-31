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

for(const locale of ["en","ja"])test("separate team pay from a member profile: "+locale,async({page})=>{
  const requests=await mockTeam(page,locale),ja=locale==="ja";
  await page.setViewportSize({width:375,height:812});
  await page.goto("/admin/staff/903?teamView=people&memberView=activity&period=month&month=2026-09");
  await expect(page.getByRole("navigation",{name:ja?"チーム一覧":"Team directory"})).toHaveCount(0);
  await expect(page.getByText(people[2].email,{exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:ja?"月次給与一覧":"Monthly team pay",exact:true})).toHaveCount(0);
  const views=page.getByRole("group",{name:ja?"メンバー表示":"Member views"});
  await views.getByRole("button",{name:ja?"給与":"Pay",exact:true}).click();
  await expect(page.getByRole("region",{name:ja?"月次給与":"Monthly pay",exact:true})).toBeVisible();
  await expect(page.getByText(people[3].name,{exact:true})).toHaveCount(0);
  await expect.poll(()=>requests.filter(r=>r.path.endsWith("/earnings")).length).toBeGreaterThan(0);
  expect(requests.filter(r=>r.path.endsWith("/earnings")).every(r=>r.path.includes("/903/")&&r.search.includes("2026-09"))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // The component's view/period query survives browser Back without changing the selected person.
  await page.goBack();
  await expect(views.getByRole("button",{name:ja?"勤務記録":"Activity",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page).toHaveURL(/staff\/903.*month=2026-09/);
  expect(requests.some(r=>r.method!=="GET")).toBe(false);
});

test("team payroll is an explicit destination, not appended to profiles",async({page})=>{
  const requests=await mockTeam(page);
  await page.goto("/admin");
  await page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Team",exact:true}).click();
  await expect(page.getByRole("navigation",{name:"Team directory"})).toBeVisible();
  await expect(page.getByRole("region",{name:"Monthly team pay",exact:true})).toHaveCount(0);
  await page.getByRole("group",{name:"Team views"}).getByRole("button",{name:"Team pay",exact:true}).click();
  await expect(page.getByRole("region",{name:"Monthly team pay",exact:true})).toBeVisible();
  await expect(page.getByRole("navigation",{name:"Team directory"})).toHaveCount(0);
  await expect(page.getByText("Total staff pay",{exact:true})).toBeVisible();
  const chart=page.getByRole("figure",{name:"Monthly staff pay by person",exact:true});
  await expect(chart).toBeHidden();
  await expect(page.getByLabel("Pay by team member",{exact:true}).getByText(people[2].name,{exact:true})).toBeVisible();
  await page.locator("summary").filter({hasText:"Pay comparison charts"}).click();
  await expect(chart).toBeVisible();
  await page.locator("summary").filter({hasText:"Pay comparison charts"}).click();
  await expect(chart).toBeHidden();
  await expect(page.getByText("Total staff pay",{exact:true})).toBeVisible();
  await expect.poll(()=>new Set(requests.filter(r=>r.path.endsWith("/earnings")).map(r=>r.path)).size).toBe(2);
  expect(requests.some(r=>r.method!=="GET")).toBe(false);
});


test("team and audit navigation preserve the selected month and member view",async({page})=>{
  const requests=await mockTeam(page);
  await page.goto("/admin?teamView=pay&month=2026-09");
  await expect(page.getByRole("region",{name:"Monthly team pay",exact:true})).toBeVisible();
  await page.getByRole("group",{name:"Team views"}).getByRole("button",{name:"People",exact:true}).click();
  await page.getByRole("navigation",{name:"Team directory"}).getByRole("button",{name:/Haruka/}).click();
  await expect(page).toHaveURL(/staff\/903.*month=2026-09/);
  await page.getByRole("group",{name:"Member views"}).getByRole("button",{name:"Pay",exact:true}).click();
  await page.getByRole("button",{name:"View audit history",exact:true}).click();
  await expect(page).toHaveURL(/staff\/903\/audit.*month=2026-09/);
  await page.getByRole("button",{name:"← Back to team profile",exact:true}).click();
  await expect(page.getByRole("group",{name:"Member views"}).getByRole("button",{name:"Pay",exact:true})).toHaveAttribute("aria-pressed","true");
  await expect(page).toHaveURL(/staff\/903.*month=2026-09/);
  await page.getByRole("button",{name:"← Team directory",exact:true}).click();
  await expect(page.getByRole("navigation",{name:"Team directory"})).toBeVisible();
  await expect(page).toHaveURL(/admin\?.*month=2026-09/);
  expect(requests.some(r=>r.method!=="GET")).toBe(false);
});
