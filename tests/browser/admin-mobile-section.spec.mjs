import {test,expect} from "@playwright/test";

const people=[
  {id:901,name:"Chuck",role:"manager",email:"chuck@example.invalid"},
  {id:902,name:"Nori",role:"manager",email:"nori@example.invalid"},
  {id:903,name:"Haruka with a very long family name for wrapping",role:"staff",email:"a-very-long-email-address-that-must-wrap-without-truncation@example.invalid"},
  {id:904,name:"Kanata",role:"staff",email:"kanata@example.invalid"},
];
async function mockTeam(page, locale="en", role="manager") {
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
    else if(path==="/admin/payment-setup/access")data={can_configure:true};
    else if(path==="/admin/payment-setup")data={provider:"unknown",channel:"online",methods:[],revision:0,processing_status:"not_connected"};
    else if(path==="/auth/me")data={...people[0],role};
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
 await expect(picker.locator("option")).toHaveCount(6);
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
 await picker.selectOption("accounts");
 await page.screenshot({path:`/tmp/barticket-mobile-section-${locale}-390.png`,fullPage:true});
 await page.setViewportSize({width:1280,height:900});
 await expect(picker).toBeHidden();
 await expect(page.getByRole("navigation",{name:ja?"管理セクション":"Admin sections"}).getByRole("button",{name:ja?"アカウント":"Accounts",exact:true})).toBeVisible();
 await page.screenshot({path:`/tmp/barticket-mobile-section-${locale}-1280.png`,fullPage:true});
 expect(requests.some(r=>r.method!=="GET")).toBe(false);
});

for(const locale of ["en","ja"])for(const width of [390,1280])test(`Admin defaults and legacy links use Accounts: ${locale} ${width}`,async({page})=>{
 const ja=locale==="ja",requests=await mockTeam(page,locale);
 await page.setViewportSize({width,height:900});
 await page.goto("/admin?section=overview");
 await expect(page).toHaveURL(/\/admin$/);
 const nav=page.getByRole("navigation",{name:ja?"管理セクション":"Admin sections"});
 const picker=page.getByRole("combobox",{name:ja?"管理メニュー":"Admin section",exact:true});
 await expect(picker.locator('option[value="overview"]')).toHaveCount(0);
 await expect(nav.getByRole("button",{name:ja?"概要":"Overview",exact:true})).toHaveCount(0);
 const selected=async(section,label)=>{
   if(width<570)await expect(picker).toHaveValue(section);
   else await expect(nav.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-pressed","true");
 };
 await selected("accounts",ja?"アカウント":"Accounts");
 if(width<570)await picker.selectOption("team");else await nav.getByRole("button",{name:ja?"チーム":"Team",exact:true}).click();
 await selected("team",ja?"チーム":"Team");
 await page.goBack();await selected("accounts",ja?"アカウント":"Accounts");
 await page.goForward();await selected("team",ja?"チーム":"Team");
 await page.reload();await selected("team",ja?"チーム":"Team");
 await page.goto("/admin/staff/903?teamView=pay&month=2026-09");
 await selected("team",ja?"チーム":"Team");
 expect(requests.some(r=>r.method!=="GET")).toBe(false);
});

test("Admin legacy Overview never bypasses the manager guard",async({page})=>{
 const requests=await mockTeam(page,"en","staff");
 await page.goto("/admin?section=overview");
 await expect(page).toHaveURL(/\/profile$/);
 await expect(page.getByRole("navigation",{name:"Admin sections"})).toHaveCount(0);
 expect(requests.some(r=>r.path==="/users" || r.method!=="GET")).toBe(false);
});

// Same component and neutral visual contract as Analytics, including at the
// two-column breakpoint. All requests stay synthetic/read-only in mockTeam.
for (const locale of ["en", "ja"]) for (const width of [570, 768, 1280]) {
 test(`Admin shared tab states stay neutral and aligned: ${locale} ${width}`, async ({page}, testInfo) => {
  const ja = locale === "ja", requests = await mockTeam(page, locale);
  await page.setViewportSize({width, height:900});
  await page.goto("/admin");
  const nav = page.getByRole("navigation", {name:ja ? "管理セクション" : "Admin sections"});
  const tabs = nav.getByRole("group", {name:ja ? "管理セクション" : "Admin sections", exact:true});
  const buttons = tabs.getByRole("button");
  await expect(buttons).toHaveCount(6);
  const indicator = tabs.locator("[data-tab-indicator]");
  const align = async () => {
   await expect(indicator).toBeVisible();
   await expect.poll(() => tabs.evaluate(el => {
    const active = el.querySelector('[aria-pressed="true"]').getBoundingClientRect();
    const selected = el.querySelector('[data-tab-indicator]').getBoundingClientRect();
    return Math.max(...['left','top','right','bottom'].map(k => Math.abs(active[k] - selected[k])));
   })).toBeLessThan(0.6);
  };
  await align();
  expect(await tabs.evaluate(el => {
   const track = el.firstElementChild, columns = getComputedStyle(track).gridTemplateColumns.split(' ').length;
   return {columns, overflow:el.scrollWidth > el.clientWidth + 1,
    labelsFit:[...track.querySelectorAll('button')].every(b => b.scrollWidth <= b.clientWidth + 1 && b.scrollHeight <= b.clientHeight + 1)};
  })).toMatchObject({columns:width < 640 ? 2 : width < 1000 ? 3 : 6, overflow:false, labelsFit:true});
  // Compare resolved colors rather than a token's authored notation (hex/rgb).
  const neutral = await tabs.evaluate(el => {
   const probe = document.createElement('span'); probe.style.color = 'var(--neutral-800)'; el.append(probe);
   const expected = getComputedStyle(probe).color; probe.remove(); return expected;
  });
  await expect(indicator).toHaveCSS('background-color', neutral);
  await buttons.nth(1).hover();
  await expect(buttons.nth(1)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(buttons.nth(1)).toHaveCSS('transform', 'none');
  await buttons.nth(1).click(); await align();
  await expect(buttons.nth(1)).toHaveAttribute('aria-pressed','true');
  await page.goBack(); await align();
  await expect(buttons.first()).toHaveAttribute('aria-pressed','true');
  await buttons.first().press('ArrowRight');
  await expect(buttons.nth(1)).toBeFocused();
  await expect(buttons.nth(1)).toHaveCSS('outline-style','solid');
  await align();
  await page.emulateMedia({reducedMotion:'reduce'});
  await buttons.nth(1).press('Home'); await align();
  await expect(indicator).toHaveCSS('transition-duration','0s');
  // Primary actions are deliberately still blue; no global palette override.
  const submit = page.locator('main form button[type="submit"]');
  const primary = await submit.evaluate(el => {
   const probe=document.createElement('span'); probe.style.color='var(--primary)'; el.append(probe);
   const expected=getComputedStyle(probe).color;probe.remove();return expected;
  });
  await expect(submit).toHaveCSS('background-color', primary);
  await page.screenshot({path:testInfo.outputPath(`audit-admin-tabs-${locale}-${width}.png`),fullPage:true});
  await page.setViewportSize({width:320,height:812});
  await expect(nav).toBeHidden();
  const picker=page.getByRole('combobox',{name:ja?'管理メニュー':'Admin section',exact:true});
  await expect(picker).toBeVisible(); await picker.selectOption('schedules');
  await expect(picker).toHaveValue('schedules');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.setViewportSize({width:768,height:1024}); await align();
  await expect(buttons.nth(3)).toHaveAttribute('aria-pressed','true');
  expect(requests.some(r=>r.method!=="GET")).toBe(false);
 });
}
