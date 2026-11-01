import {test, expect} from "@playwright/test";
const API = "http://127.0.0.1:8765";

async function fixture(page, {locale = "en", id = 7, incomplete = false, legacyPartial = false, breakdownReport = null, earningsReport = null, noriReport = null} = {}) {
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
      gross_salary_yen:40000,staff_cost_total_yen:legacyPartial ? 13000 : incomplete ? null : 13000,deduction_total_yen:0,
      net_amount_owed_yen:legacyPartial ? 27000 : incomplete ? null : 27000,staff_owed:[],deductions:[],
      blockers:incomplete ? ["staff_hourly_rate_missing"] : [],note:"This is a pay estimate, not a payment record."};
    else if(url.pathname === "/profile/managed-shift-stats") body = {user_id:id,month,period:url.searchParams.get("period"),basis:"original_service_business_date",date_from:null,date_to:null,nights:[],weekdays:Array.from({length:7},(_,weekday)=>({weekday,shift_count:0,sales_total_yen:0,average_sales_yen:null})),summary_shift_count:0,summary_sales_yen:0,summary_guests:0,excluded_open_shift_count:0,excluded_incomplete_shift_count:0,excluded_ambiguous_day_count:0};
    else if(url.pathname === "/analytics/shifts") body=[];
    else if(url.pathname === "/analytics/service-sales") body={basis:"original_service_business_date",days:[]};
    else if(url.pathname === "/realtime/events") body={events:[],cursor:0};
    else {status=404;body={detail:"Unmocked read"};}
    if(url.pathname === "/profile/chuck-monthly-pay" && breakdownReport) Object.assign(body, breakdownReport);
    if(url.pathname === "/profile/earnings" && earningsReport) Object.assign(body, earningsReport);
    if(url.pathname === "/profile/nori-monthly-pay" && noriReport) Object.assign(body, noriReport);
    await route.fulfill({status,json:body,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  await page.goto("/profile?section=pay");
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
  await expect(page.getByText(ja?"Chuckの差引後見積もり（記録済みデータ）":"Chuck’s remaining estimate (recorded data)",{exact:true}).locator("..").locator("strong")).toHaveText("—");
 }else{
  await expect(page.getByText(ja?"スタッフ給与差引後の残額":"Remaining after staff earnings",{exact:true}).locator("..").locator("strong")).toHaveText("—");
  await expect(page.getByText("Haruka",{exact:true}).locator("../..")).toContainText(/[¥￥]0/);
  await expect(page.getByText("Kanata",{exact:true}).locator("../..")).toContainText("—");
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath("pay.png"),fullPage:true});
 for(const [section,label]of [["history",ja?"勤務履歴":"Work history"],["shift",ja?"勤務":"Shift"],["account",ja?"アカウント設定":"Account settings"]]){
  await sections.getByRole("button",{name:label,exact:true}).click();
  await expect(page).toHaveURL(section === "shift" ? /\/profile$/ : new RegExp("section="+section));
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

for (const locale of ["en", "ja"]) for (const width of [320, 1280]) test(`incomplete legacy manager pay stays unavailable ${locale} ${width}`, async ({page}) => {
  await page.setViewportSize({width, height:900});
  const calls = await fixture(page, {locale, id:901, incomplete:true, legacyPartial:true});
  const ja = locale === "ja";
  await expect(page.getByText(ja ? "Chuckの差引後見積もり（記録済みデータ）" : "Chuck’s remaining estimate (recorded data)", {exact:true}).locator("..").locator("strong")).toHaveText("—");
  await expect(page.getByRole("heading",{name:ja ? "給与の内訳・明細" : "Pay breakdown and details",exact:true})).toBeVisible();
  const warning = page.getByRole("status", {name:ja ? "給与見積もりの確認事項" : "Pay estimate warnings"});
  await expect(warning).toContainText(ja ? "確認が必要です" : "Needs review");
  await expect(warning).toContainText(ja ? "スタッフの時給が未設定です。" : "A staff hourly rate is missing.");
  await expect(warning).toHaveCSS("color", "rgb(255, 229, 101)");
  await expect(warning.locator("svg")).toBeVisible();
  const subtotal = page.getByText(ja ? "記録済みスタッフ給与の小計（一部）" : "Recorded staff pay subtotal (partial)", {exact:true}).locator("..");
  await expect(subtotal).toContainText(/[¥￥]13,000/);
  await expect(page.getByRole("region", {name:ja ? "売上から給与までの内訳" : "Revenue to pay breakdown"})).toContainText(ja ? "最終的な支払額ではありません" : "not the final amount owed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(calls.filter(x => !x.startsWith("GET "))).toEqual([]);
});

for (const locale of ["en", "ja"]) for (const width of [320, 1280]) test(`revenue to pay breakdown preserves recorded allocations ${locale} ${width}`, async ({page}, testInfo) => {
  await page.setViewportSize({width, height:900});
  const ja = locale === "ja";
  const calls = await fixture(page, {locale, id:901, breakdownReport:{
    eligible_revenue_yen:25000,tier_rate_percent:40,gross_salary_yen:10000,
    staff_cost_total_yen:3000,deduction_total_yen:500,net_amount_owed_yen:6500,complete:true,
    staff_owed:[{user_id:11,name:"Staff A",wages_yen:800,staff_drink_bonus_yen:200,total_owed_yen:1000},
      {user_id:12,name:"Staff B",wages_yen:1800,staff_drink_bonus_yen:200,total_owed_yen:2000}],
    deductions:[{id:1,category:"manager_pay_deduction",business_date:"2026-10-01",amount_yen:1000,payee_name:"Recorded recipient",reason:"Recorded withdrawal",reversal_of_id:null},
      {id:2,category:"manager_pay_deduction",business_date:"2026-10-02",amount_yen:-500,payee_name:"Recorded recipient",reason:"Recorded correction",reversal_of_id:1}]
  }});
  await expect(page.getByRole("heading",{name:ja ? "給与の内訳・明細" : "Pay breakdown and details",exact:true})).toBeVisible();
  const breakdown=page.getByRole("region", {name:ja ? "売上から給与までの内訳" : "Revenue to pay breakdown"});
  await expect(breakdown).toContainText(/[¥￥]25,000/);
  await expect(breakdown).toContainText("40%");
  await expect(page.getByRole("status",{name:ja?"ドリンク記録の確認状況":"Drink-data coverage"})).toContainText(ja?"ドリンク記録の網羅性は未確認です":"Drink-record coverage is unreviewed");
  for(const name of ["Staff A","Staff B"])for(const part of [ja?"賃金":"Wages",ja?"記録済みドリンク手当":"Recorded drink bonus"])await expect(breakdown.getByText(`${name} · ${part}`,{exact:true})).toBeVisible();
  await expect(breakdown.locator("dl").getByText(ja ? "差引後の自分の取り分（見積もり）" : "Your remaining share (estimate)", {exact:true}).locator("..")).toContainText(/[¥￥]6,500/);
  await expect(breakdown.getByRole("list", {name:ja ? "スタッフ別給与の明細" : "Staff pay entries"}).getByText("Staff A", {exact:true}).locator("../..")).toContainText(/[¥￥]1,000/);
  await expect(breakdown.getByRole("list", {name:ja ? "スタッフ別給与の明細" : "Staff pay entries"}).getByText("Staff B", {exact:true}).locator("../..")).toContainText(/[¥￥]2,000/);
  await expect(breakdown).toContainText(/-[¥￥]500/);
  await expect(breakdown).toContainText(ja ? "取消元の記録" : "Reversal of entry");
  await expect(breakdown).toContainText(ja ? "支払・現金受領の証明ではありません" : "not a payment or cash-receipt record");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("pay-breakdown.png"),fullPage:true});
  expect(calls.filter(x=>!x.startsWith("GET "))).toEqual([]);
});

for(const locale of ['en','ja'])for(const width of [320,1280])test(`partial drink data never displays final allocation ${locale} ${width}`,async({page},testInfo)=>{
 const ja=locale==='ja';await page.setViewportSize({width,height:900});
 const calls=await fixture(page,{locale,id:901,breakdownReport:{complete:true,staff_drink_data_status:'incomplete',blockers:[],gross_salary_yen:10000,eligible_revenue_yen:25000,tier_rate_percent:40,net_amount_owed_yen:width===320?6500:null,staff_cost_total_yen:width===320?3000:null,recorded_staff_cost_total_yen:3000,deduction_total_yen:500,
 staff_owed:[{user_id:11,name:'Staff A',wages_yen:800,staff_drink_bonus_yen:200,total_owed_yen:width===320?1000:null,recorded_total_yen:1000},{user_id:12,name:'Staff B',wages_yen:1800,staff_drink_bonus_yen:200,total_owed_yen:width===320?2000:null,recorded_total_yen:2000}],deductions:[{id:1,category:'manager_pay_deduction',amount_yen:500,business_date:'2026-10-01',reason:'Recorded ledger',reversal_of_id:null}]}});
 await expect(page.getByText(ja?'Chuckの差引後見積もり（記録済みデータ）':'Chuck’s remaining estimate (recorded data)',{exact:true}).locator('..').locator('strong')).toHaveText('—');
 await expect(page.getByRole('status',{name:ja?'ドリンク記録の確認状況':'Drink-data coverage'})).toContainText(ja?'ドリンク記録が不足しています':'Drink records are incomplete');
 await expect(page.getByRole("heading",{name:ja?'給与の内訳・明細':'Pay breakdown and details',exact:true})).toBeVisible();
 const region=page.getByRole('region',{name:ja?'売上から給与までの内訳':'Revenue to pay breakdown'});
 await expect(region.getByRole('heading',{name:ja?'記録済み費用差引後の残額（暫定）':'Remaining after recorded costs (provisional)',exact:true})).toBeVisible();
 for(const name of ['Staff A','Staff B'])for(const part of [ja?'賃金':'Wages',ja?'記録済みドリンク手当':'Recorded drink bonus'])await expect(region.getByText(`${name} · ${part}`,{exact:true})).toBeVisible();
 await expect(region.getByText(ja?'差引後の自分の取り分（見積もり）':'Your remaining share (estimate)',{exact:true}).locator('..')).toContainText('—');
 await expect(region.getByRole('complementary',{name:ja?'取り分の配分グラフ':'Share allocation chart'})).toContainText(/[¥￥]6,500/);
 const details=region.getByRole('region',{name:ja?'給与と控除の明細':'Pay and deduction details'}), chart=region.getByRole('complementary',{name:ja?'取り分の配分グラフ':'Share allocation chart'});
 await expect(details.getByRole('list',{name:ja?'控除の明細':'Deduction entries'})).toContainText('Recorded ledger');
 const a=await details.boundingBox(),b=await chart.boundingBox();
 if(width===1280)expect(b.x).toBeGreaterThan(a.x+a.width-1);else expect(b.y).toBeGreaterThan(a.y+a.height-1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('pay-breakdown.png'),fullPage:true});
 expect(calls.filter(x=>!x.startsWith('GET '))).toEqual([]);
});

for(const locale of ['en','ja'])test(`staff and owner keep incomplete drink pay nonfinal ${locale}`,async({page})=>{
 const ja=locale==='ja';const calls=await fixture(page,{locale,id:7,earningsReport:{categories:[{category:'hourly_wages',amount_yen_unrounded:'1000',complete:true,entries:[]},{category:'staff_drink_bonus',amount_yen:200,complete:false,entries:[]}]}});
 await expect(page.getByText(ja?'月間給与の見積もり':'Monthly pay estimate',{exact:true}).locator('..').locator('strong')).toHaveText('—');
 await expect(page.getByText(ja?'スタッフドリンク手当':'Staff-drink bonus',{exact:true}).locator('..')).toContainText(ja?'記録済み小計（一部）':'Recorded subtotal (partial)');
 await expect(page.getByText(ja?'スタッフドリンク手当':'Staff-drink bonus',{exact:true}).locator('..')).toContainText(/[¥￥]200/);
 expect(calls.filter(x=>!x.startsWith('GET '))).toEqual([]);
 await page.unrouteAll({behavior:'wait'});
 const ownerCalls=await fixture(page,{locale,id:902,noriReport:{own_income:{amount_yen:null,status:'incomplete',complete:false,blockers:['staff_drink_data_incomplete'],source:'monthly_revenue_less_recorded_staff_earnings',basis:'before_other_expenses'},staff_owed:[{payee:'chuck',user_id:901,name:'Chuck',amount_yen:null,status:'incomplete',blockers:['staff_drink_data_incomplete'],source:'chuck_monthly_pay_preview'}]}});
 await expect(page.getByText(ja?'スタッフ給与差引後の残額':'Remaining after staff earnings',{exact:true}).locator('..').locator('strong')).toHaveText('—');
 await expect(page.getByText(ja?'スタッフドリンク記録が不足しています。':'Staff-drink records are incomplete.').first()).toBeVisible();
 expect(ownerCalls.filter(x=>!x.startsWith('GET '))).toEqual([]);
});
