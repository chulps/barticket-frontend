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
    else if(path==="/admin/payment-setup/access")data={can_configure:true};
    else if(path==="/admin/payment-setup")data={provider:"unknown",channel:"online",methods:[],revision:0,processing_status:"not_connected"};
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


for(const locale of ["en","ja"])for(const width of [320,390,1280])test(`consistent native carets ${locale} ${width}`,async({page},testInfo)=>{
 const requests=await mockTeam(page,locale);
 await page.setViewportSize({width,height:900});await page.goto("/admin");
 await expect(page.getByRole("heading",{name:locale==="ja"?"管理":"Admin",exact:true})).toBeVisible();
 const picker=page.getByRole("combobox",{name:locale==="ja"?"管理メニュー":"Admin section",exact:true});
 if(width<700)await picker.selectOption("accounts");
 else await page.getByRole("navigation",{name:locale==="ja"?"管理セクション":"Admin sections"}).getByRole("button",{name:locale==="ja"?"アカウント":"Accounts",exact:true}).click();
 const role=page.locator("form select");await expect(role).toBeVisible();
 const selects=page.locator("select:visible");
 async function inspect(){
  const styles=await selects.evaluateAll(nodes=>nodes.map(el=>{const s=getComputedStyle(el);return {image:s.backgroundImage,size:s.backgroundSize,pad:s.paddingRight,position:s.backgroundPosition,appearance:s.appearance};}));
  expect(styles.length).toBeGreaterThan(0);
  for(const s of styles){expect(s.image).toContain("M213.66");expect(s.size).toBe("18px 18px");expect(s.pad).toBe("42px");expect(s.appearance).toBe("none");}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await inspect();
 await role.focus();await expect(role).toBeFocused();await role.press("End");await role.press("Enter");await expect(role).toHaveValue("manager");
 if(width<700){await picker.selectOption("payments");await inspect();await picker.selectOption("accounts");await expect(role).toHaveValue("manager");}
 // Enter can leave the desktop OS picker open; close it before screenshot capture.
 await role.press("Escape");
 await page.getByRole("heading",{name:locale==="ja"?"管理":"Admin",exact:true}).click();
 await page.screenshot({path:testInfo.outputPath("carets.png"),fullPage:true});
 await page.evaluate(()=>document.documentElement.classList.add("light"));
 await inspect();
 const lightImage=await role.evaluate(el=>getComputedStyle(el).backgroundImage);
 expect(decodeURIComponent(lightImage)).toContain("fill='#4c4f55'");
 await expect(role).toHaveCSS("color","rgb(76, 79, 85)");
 await page.screenshot({path:testInfo.outputPath("carets-light.png"),fullPage:true});
 await page.evaluate(()=>document.documentElement.classList.remove("light"));
 const darkImage=await role.evaluate(el=>getComputedStyle(el).backgroundImage);
 expect(decodeURIComponent(darkImage)).toContain("fill='#f5f5f5'");
 await page.emulateMedia({forcedColors:"active"});
 await expect(selects.first()).toHaveCSS("appearance","auto");
 await expect(selects.first()).toHaveCSS("background-image","none");
 expect(requests.some(r=>r.method!=="GET")).toBe(false);
});
