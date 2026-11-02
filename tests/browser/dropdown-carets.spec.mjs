import {selectOption} from "./helpers/select.mjs";
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


for(const locale of ['en','ja'])for(const width of [320,390,768])test(`consistent custom dropdown ${locale} ${width}`,async({page},testInfo)=>{
 const requests=await mockTeam(page,locale);await page.setViewportSize({width,height:900});await page.goto('/admin');
 await expect(page.getByRole('heading',{name:locale==='ja'?'管理':'Admin',exact:true})).toBeVisible();
 const picker=page.getByRole('combobox',{name:locale==='ja'?'管理メニュー':'Admin section',exact:true});
 if(width<570)await selectOption(picker,'accounts');else await page.getByRole('navigation',{name:locale==='ja'?'管理セクション':'Admin sections'}).getByRole('button',{name:locale==='ja'?'アカウント':'Accounts',exact:true}).click();
 const role=page.locator('form [data-select-trigger]');await expect(role).toBeVisible();
 await role.focus();await role.press('End');await role.press('Enter');await expect(role).toHaveAttribute('data-select-value','manager');
 async function inspect(){
  const controls=page.locator('[data-select-trigger]:visible');
  // The 18px square's axis-aligned bounding box grows during caret rotation.
  // Wait for the real transition to finish, then retain the exact size check.
  await expect.poll(()=>controls.evaluateAll(nodes=>nodes.every(el=>
   [...el.querySelectorAll('svg')].every(svg=>svg.parentElement.getAnimations().every(animation=>animation.playState!=='running'))
  ))).toBe(true);
  const styles=await controls.evaluateAll(nodes=>nodes.map(el=>{const s=getComputedStyle(el);return {color:s.color,bg:s.backgroundColor,height:el.getBoundingClientRect().height,overflow:el.scrollWidth>el.clientWidth,caret:el.querySelector('svg')?.getBoundingClientRect().width};}));
  const luminance=value=>{const rgb=value.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  for(const s of styles){expect(s.height).toBeGreaterThanOrEqual(44);expect(s.overflow).toBe(false);expect(s.caret).toBe(18);const a=luminance(s.color),b=luminance(s.bg);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await inspect();await role.click();await expect(page.getByRole('listbox')).toBeVisible();await expect(page.getByRole('listbox')).toHaveCSS('opacity','1');await page.screenshot({path:testInfo.outputPath('audit-dropdown-admin.png'),fullPage:true});await role.press('Escape');
 if(width<570){await selectOption(picker,'payments');await page.getByText(locale==='ja'?'詳しい決済会社の設定':'Advanced provider preferences',{exact:true}).click();await expect(page.getByRole('combobox',{name:locale==='ja'?'現在または検討中の決済会社':'Current or proposed provider',exact:true})).toBeVisible();await inspect();await selectOption(picker,'accounts');await expect(role).toHaveAttribute('data-select-value','manager');}
 await page.evaluate(()=>document.documentElement.classList.add('light'));await inspect();await role.click();await expect(page.getByRole('listbox')).toHaveCSS('opacity','1');await page.screenshot({path:testInfo.outputPath('audit-dropdown-light.png'),fullPage:true});await role.press('Escape');
 await page.emulateMedia({forcedColors:'active'});await role.focus();await expect(role).toBeFocused();await role.press('Home');await role.press('Enter');await expect(role).toHaveAttribute('data-select-value','staff');
 expect(requests.some(r=>r.method!=='GET')).toBe(false);
});
