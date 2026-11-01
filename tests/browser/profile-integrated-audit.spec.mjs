import {test, expect} from "@playwright/test";
const API = "http://127.0.0.1:8765";

async function fixture(page, {locale = "en", id = 7, incomplete = false, legacyPartial = false, breakdownReport = null, earningsReport = null, noriReport = null, managedReport = null} = {}) {
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
    if(url.pathname === "/profile/managed-shift-stats" && managedReport) Object.assign(body, managedReport);
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
  await expect(page.getByRole("region", {name:ja ? "売上から給与までの内訳" : "Revenue to pay breakdown"})).toContainText(ja ? "全体の見積もり（未確認）" : "Full estimate (not verified)");
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
  await expect(breakdown.locator("dl").getByText(ja ? "報告済みの給与見積もり" : "Reported pay estimate", {exact:true}).locator("..")).toContainText(/[¥￥]6,500/);
  await expect(breakdown.getByRole("list", {name:ja ? "スタッフ別給与の明細" : "Staff pay entries"}).getByText("Staff A", {exact:true}).locator("../..")).toContainText(/[¥￥]1,000/);
  await expect(breakdown.getByRole("list", {name:ja ? "スタッフ別給与の明細" : "Staff pay entries"}).getByText("Staff B", {exact:true}).locator("../..")).toContainText(/[¥￥]2,000/);
  await expect(breakdown).toContainText(/-[¥￥]500/);
  await expect(breakdown).toContainText(ja ? "取消元の記録" : "Reversal of entry");
  await expect(page.getByText(ja ? /給与が支払済みか、現金を受領したかは/ : /does not establish which wages have been paid/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("pay-breakdown.png"),fullPage:true});
  expect(calls.filter(x=>!x.startsWith("GET "))).toEqual([]);
});

for(const locale of ['en','ja'])for(const width of [320,1280])test(`partial drink data never displays final allocation ${locale} ${width}`,async({page},testInfo)=>{
 const ja=locale==='ja';await page.setViewportSize({width,height:900});
 const calls=await fixture(page,{locale,id:901,breakdownReport:{complete:true,staff_drink_data_status:'incomplete',blockers:[],gross_salary_yen:10000,eligible_revenue_yen:25000,tier_rate_percent:40,net_amount_owed_yen:width===320?6500:null,staff_cost_total_yen:width===320?3000:null,recorded_staff_cost_total_yen:3000,deduction_total_yen:500,
 staff_owed:[{user_id:11,name:'Staff A',wages_yen:800,staff_drink_bonus_yen:200,total_owed_yen:width===320?1000:null,recorded_total_yen:1000},{user_id:12,name:'Staff B',wages_yen:1800,staff_drink_bonus_yen:200,total_owed_yen:width===320?2000:null,recorded_total_yen:2000}],deductions:[{id:1,category:'manager_pay_deduction',amount_yen:500,business_date:'2026-10-01',reason:'Recorded ledger',reversal_of_id:null}]}});
 await expect(page.getByText(ja?'Chuckの差引後見積もり（記録済みデータ）':'Chuck’s remaining estimate (recorded data)',{exact:true}).locator('..').locator('strong')).toHaveText(/[¥￥]6,500/);
 await expect(page.getByRole('status',{name:ja?'ドリンク記録の確認状況':'Drink-data coverage'})).toContainText(ja?'ドリンク記録が不足しています':'Drink records are incomplete');
 await expect(page.getByRole("heading",{name:ja?'給与の内訳・明細':'Pay breakdown and details',exact:true})).toBeVisible();
 const region=page.getByRole('region',{name:ja?'売上から給与までの内訳':'Revenue to pay breakdown'});
 await expect(region.getByRole('heading',{name:ja?'総取り分の配分（記録済みデータ）':'Gross share allocation (recorded data)',exact:true})).toBeVisible();
 for(const name of ['Staff A','Staff B'])for(const part of [ja?'賃金':'Wages',ja?'記録済みドリンク手当':'Recorded drink bonus'])await expect(region.getByText(`${name} · ${part}`,{exact:true})).toBeVisible();
 await expect(region.getByText(ja?'全体の見積もり（未確認）':'Full estimate (not verified)',{exact:true}).locator('..')).toContainText('—');
 await expect(region.locator('[data-pay-gross-center]')).toHaveText(/[¥￥]10,000/);
 const details=region.getByRole('region',{name:ja?'給与と控除の明細':'Pay and deduction details'}), chart=region.getByRole('complementary',{name:ja?'取り分の配分グラフ':'Share allocation chart'});
 await expect(region.getByRole('list',{name:ja?'控除の明細':'Deduction entries'})).toContainText('Recorded ledger');
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

// #375: mobile-first, always-open pay hierarchy. These mocks never submit/pay anything.
for (const locale of ['en', 'ja']) for (const width of [320, 390, 768, 1280]) for (const state of ['partial', 'unknown', 'zero', 'inconsistent', 'large']) test(`pay hierarchy ${locale} ${width} ${state}`, async ({page}, testInfo) => {
 const ja = locale === 'ja';
 await page.setViewportSize({width, height:900});
 await page.clock.install({time:new Date('2026-10-31T00:00:00Z')});
 const report = {complete:false, staff_drink_data_status:'incomplete', blockers:['staff_drink_data_incomplete'], eligible_revenue_yen:25000, tier_rate_percent:40, gross_salary_yen:10000, staff_cost_total_yen:null, recorded_staff_cost_total_yen:3000, deduction_total_yen:500, net_amount_owed_yen:null,
 staff_owed:[{user_id:11,name:'Staff A / スタッフ',wages_yen:2800,staff_drink_bonus_yen:200,total_owed_yen:null,recorded_total_yen:3000}], deductions:[{id:1,category:'manager_pay_deduction',business_date:'2026-10-01',amount_yen:500,payee_name:'Recipient',reason:'Recorded ledger',reversal_of_id:null}]};
 if (state === 'unknown') Object.assign(report, {gross_salary_yen:null});
 if (state === 'inconsistent') Object.assign(report, {deduction_total_yen:501});
 if (state === 'zero') Object.assign(report, {complete:true,staff_drink_data_status:'complete',blockers:[],eligible_revenue_yen:0,gross_salary_yen:0,staff_cost_total_yen:0,recorded_staff_cost_total_yen:0,deduction_total_yen:0,net_amount_owed_yen:0,staff_owed:[],deductions:[]});
 if (state === 'large') Object.assign(report, {gross_salary_yen:1234567890,eligible_revenue_yen:3086419725});
 const calls = await fixture(page,{locale,id:901,breakdownReport:report});
 const hero = page.getByText(ja?'Chuckの差引後見積もり（記録済みデータ）':'Chuck’s remaining estimate (recorded data)',{exact:true}).locator('..');
 await expect(hero.locator('strong')).toHaveText(state === 'unknown' || state === 'inconsistent' ? '—' : state === 'zero' ? /[¥￥]0/ : state === 'large' ? /[¥￥]1,234,564,390/ : /[¥￥]6,500/);
 expect(parseFloat(await hero.locator('strong').evaluate(el=>getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(32);
 await expect(hero).toContainText(ja?'暫定':'Provisional');
 const region=page.getByRole('region',{name:ja?'売上から給与までの内訳':'Revenue to pay breakdown'});
 const chart=region.getByRole('complementary',{name:ja?'取り分の配分グラフ':'Share allocation chart'});
 const ledger=region.getByRole('heading',{name:ja?'給与からの記録済み控除':'Recorded deductions from your share',exact:true});
 await expect(ledger).toBeVisible();
 await expect(region.getByRole('heading',{name:ja?'スタッフ別の配分':'What goes to each staff member',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:ja?'見積もりについて':'About this estimate',exact:true})).toBeVisible();
 expect(await region.locator('details').count()).toBe(0);
 expect((await ledger.boundingBox()).y).toBeGreaterThanOrEqual((await chart.boundingBox()).y+(await chart.boundingBox()).height);
 if (['partial','large'].includes(state)) {
  await expect(region.locator('[data-pay-gross-center]')).toHaveText(state==='large'?/[¥￥]1,234,567,890/:/[¥￥]10,000/);
  await expect(region.getByRole('list',{name:ja?'控除の明細':'Deduction entries'})).toContainText('Recorded ledger');
 } else await expect(region.locator('[data-pay-gross-center]')).toHaveCount(0);
 if(state==='zero') await expect(chart).toContainText(ja?'記録済みの総取り分は0円のため、円グラフはありません。':'The recorded gross share is zero, so there is no allocation to chart.');
 if(!['partial','large'].includes(state)) await expect(chart).not.toContainText(ja?'中央はスタッフ給与・控除前の総取り分です':'Center: gross share before staff pay and deductions.');
 if(state!=='zero') await expect(page.getByRole('status',{name:ja?'ドリンク記録の確認状況':'Drink-data coverage'})).toContainText(ja?'ドリンク記録が不足しています':'Drink records are incomplete');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('list',{name:ja?'曜日別の平均売上とシフト数':'Weekday averages and shift counts'})).toHaveCount(0);
 await expect(page.getByText(ja?'比較できるシフトがありません。':'No eligible shifts to compare.',{exact:true})).toBeVisible();
 expect(calls.filter(x=>!x.startsWith('GET '))).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('pay-hierarchy.png'),fullPage:true});
});

for(const locale of ['en','ja']) test(`managed zero sales with eligible shifts remains data ${locale}`,async({page},testInfo)=>{
 const ja=locale==='ja'; await page.setViewportSize({width:390,height:900});
 const calls=await fixture(page,{locale,id:901,managedReport:{summary_shift_count:1,summary_sales_yen:0,summary_guests:0,nights:[{shift_id:98,business_date:'2026-10-20',sales_yen:0}],weekdays:Array.from({length:7},(_,weekday)=>({weekday,shift_count:weekday===0?1:0,sales_total_yen:0,average_sales_yen:weekday===0?0:null}))}});
 await expect(page.getByRole('list',{name:ja?'曜日別の平均売上とシフト数':'Weekday averages and shift counts'})).toBeVisible();
 await expect(page.getByText(ja?'比較できるシフトがありません。':'No eligible shifts to compare.',{exact:true})).toHaveCount(0);
 expect(calls.filter(x=>!x.startsWith('GET '))).toEqual([]);
 await page.screenshot({path:testInfo.outputPath('pay-hierarchy-zero-sales.png'),fullPage:true});
});
