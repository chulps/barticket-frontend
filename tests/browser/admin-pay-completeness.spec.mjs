import {test,expect} from '@playwright/test';
const API='http://127.0.0.1:8765';
const coverage=status=>({staff_drink_data_status:status,final_pay_complete:status==='complete',recorded_inputs_only:status!=='complete'});
function staffReport(id,status,zero=false){
 const result={user_id:id,month:'2026-10',preview_only:true,...coverage(status),categories:[
  {category:'hourly_wages',complete:true,amount_yen_unrounded:zero?'0':'1000',entries:[]},
  {category:'staff_drink_bonus',...coverage(status),complete:status!=='incomplete',amount_yen:zero?0:200,entries:[]},
 ],note:'Synthetic recorded inputs, not a payment record.'};
 if(status==='legacy')for(const key of Object.keys(coverage('complete'))){delete result[key];delete result.categories[1][key];}
 return result;
}
async function fixture(page,locale,mode){
 const calls=[];let fail=false;let delayedResolve;const pending=new Promise(r=>delayedResolve=r);
 const people=mode.startsWith('manager')?[{id:901,name:'Fixture manager',role:'manager'}]:[
  {id:903,name:'Fixture staff A',role:'staff'},...(mode==='mixed'?[{id:904,name:'Fixture staff B',role:'staff'}]:[]),
 ];
 await page.addInitScript(()=>localStorage.setItem('barticket_token','ISOLATED_ADMIN_PAY_FIXTURE'));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route(API+'/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,OPTIONS'}});
  calls.push(req.method()+' '+url.pathname);
  if(req.method()!=='GET')return route.abort();
  const month=url.searchParams.get('month');
  if(mode==='delayed'&&month==='2026-10')await pending;
  let status=mode==='mixed'?(url.pathname.includes('/904/')?'complete':'unknown'):mode==='zero'?'complete':mode==='delayed'?(month==='2026-10'?'complete':'unknown'):mode;
  let body=staffReport(url.pathname.includes('/904/')?904:903,status,mode==='zero');
  if(mode.startsWith('manager')){
   status=mode==='managerComplete'?'complete':mode==='managerIncomplete'?'incomplete':'unknown';
   body={user_id:901,month,...coverage(status),preview_only:true,complete:true,gross_salary_yen:2000,staff_cost_total_yen:700,recorded_staff_cost_total_yen:700,deduction_total_yen:100,net_amount_owed_yen:1200,staff_owed:[{user_id:903,name:'Fixture staff with a long family name',wages_yen:600,staff_drink_bonus_yen:100}],deductions:[{id:1,business_date:'2026-10-01',payee_name:'Fixture recipient with a long family name',amount_yen:100,reason:'Synthetic deduction entry for layout review'}],blockers:[],note:'Estimate'};
   if(mode==='managerIncomplete')Object.assign(body,{complete:false,net_amount_owed_yen:null,staff_cost_total_yen:null,blockers:['staff_drink_data_incomplete','staff_payroll_costs_incomplete']});
  }
  await route.fulfill({status:fail?503:200,json:fail?{detail:'Fixture unavailable'}:body,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.route('**/admin-pay-coverage-fixture',route=>route.fulfill({contentType:'text/html',body:`<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
  import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
  import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  const {default:Overview}=await import('/src/pages/AdminMonthlyPayOverview.tsx');import '/src/index.css';
  const people=${JSON.stringify(people)},viewer={id:901,role:'manager',name:'Fixture manager'};
  function Harness(){const[month,setMonth]=React.useState('2026-10');const[refresh,setRefresh]=React.useState(0);return React.createElement('main',{style:{padding:16,maxWidth:900,margin:'auto'}},
   React.createElement('button',{onClick:()=>setMonth('2026-11')},'Next fixture month'),React.createElement('button',{onClick:()=>setRefresh(v=>v+1)},'Refresh fixture'),
   React.createElement(Overview,{viewer,people,locale:${JSON.stringify(locale)},month,refreshVersion:refresh}));}
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
 </script></body></html>`}));
 await page.goto('/admin-pay-coverage-fixture');
 return {calls,setFail:value=>{fail=value},resolve:()=>delayedResolve()};
}
for(const locale of ['en','ja'])for(const width of [320,390,768])for(const mode of ['unknown','incomplete','legacy','zero','complete','mixed']){
 test(`Admin monthly pay coverage ${mode} ${locale} ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:1100});const state=await fixture(page,locale,mode);const ja=locale==='ja';
  const card=page.getByRole('article',{name:'Fixture staff A',exact:true});await expect(card).toBeVisible();
  const complete=['zero','complete'].includes(mode);
  const total=page.getByText(ja?'スタッフ給与合計':'Total staff pay',{exact:true}).locator('..');
  await expect(total.locator('strong')).toHaveText(complete?(mode==='zero'?/[¥￥]0/:/[¥￥]1,200/):(ja?'未確認':'Incomplete'));
  await expect(card.locator('[aria-label="'+(complete?(ja?'支払予定額':'Amount owed'):(ja?'給与総額は未確定':'Full pay unavailable'))+'"]')).toContainText(complete?(mode==='zero'?/[¥￥]0/:/[¥￥]1,200/):'—');
  await expect(card.locator('dt').filter({hasText:ja?'記録済みのドリンク手当':'Recorded drink bonus'}).locator('..').locator('dd')).toHaveText(mode==='zero'?/[¥￥]0/:/[¥￥]200/);
  if(!complete)await expect(card).not.toContainText(ja?'勤務時間または時給が未確認です':'Hours or rates are unverified');
  if(mode==='incomplete')await expect(card).toContainText(ja?'ドリンク記録が不足':'Drink records are incomplete');
  if(mode==='unknown'||mode==='legacy'||mode==='mixed')await expect(card).toContainText(ja?'ドリンク記録が未確認':'Drink records are unverified');
  const comparison=page.getByRole('heading',{name:ja?'給与の比較グラフ':'Pay comparison charts'});
  if(mode==='complete'||mode==='mixed'){
   await expect(comparison).toBeVisible();await expect(page.getByRole('meter')).toHaveCount(1);
   await expect(page.getByRole('meter')).toHaveAttribute('aria-label',mode==='mixed'?'Fixture staff B':'Fixture staff A');
   if(mode==='mixed')await expect(page.getByText(ja?/1名分は給与記録の確認/:/1 member\(s\) are omitted/)).toBeVisible();
  }else await expect(comparison).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(state.calls.every(call=>call.startsWith('GET '))).toBe(true);
  await page.getByRole('region',{name:ja?'月次給与一覧':'Monthly team pay',exact:true}).screenshot({path:testInfo.outputPath('audit-admin-pay-coverage.png')});
 });
}
for(const locale of ['en','ja'])for(const width of [320,390,768])for(const mode of ['managerUnknown','managerIncomplete','managerComplete']){
 test(`Admin manager final pay coverage ${mode} ${locale} ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:1100});await fixture(page,locale,mode);const ja=locale==='ja';const card=page.getByRole('article',{name:'Fixture manager',exact:true});await expect(card).toBeVisible();
  if(mode!=='managerComplete'){
   await expect(card.getByLabel(ja?'給与総額は未確定':'Full pay unavailable')).toContainText('—');
   await expect(page.getByRole('heading',{name:ja?'給与の比較グラフ':'Pay comparison charts'})).toHaveCount(0);
  }else{
   await expect(card.getByLabel(ja?'支払予定額':'Amount owed')).toContainText(/[¥￥]1,200/);
   await expect(page.getByRole('heading',{name:ja?'給与の比較グラフ':'Pay comparison charts'})).toBeVisible();await expect(page.getByRole('meter')).toHaveCount(1);
  }
  await expect(card.getByRole('heading',{name:ja?'スタッフ給与と控除の内訳':'Staff pay and deductions'})).toBeVisible();
  await expect(card.getByText('Synthetic deduction entry for layout review',{exact:false})).toBeVisible();
  await expect(card.locator('details')).toHaveCount(0);
  if(mode==='managerIncomplete'){await expect(card).toContainText(ja?'スタッフ給与の確認が完了':'Staff pay coverage is unverified');await expect(card).not.toContainText('staff_payroll_costs_incomplete');}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await card.screenshot({path:testInfo.outputPath('audit-admin-manager-coverage.png')});
 });
}
for(const locale of ['en','ja']){
 test(`Admin pay newer month wins over stale complete response ${locale}`,async({page})=>{
  const state=await fixture(page,locale,'delayed');await expect(page.getByRole('status')).toBeVisible();
  await page.getByRole('button',{name:'Next fixture month'}).click();const card=page.getByRole('article',{name:'Fixture staff A'});await expect(card).toBeVisible();
  const oldResponse=page.waitForResponse(response=>response.url().includes('month=2026-10'));state.resolve();await (await oldResponse).finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(card.getByLabel(locale==='ja'?'給与総額は未確定':'Full pay unavailable')).toContainText('—');
  await expect(card).toContainText(locale==='ja'?'ドリンク記録が未確認':'Drink records are unverified');
 });
 test(`Admin pay failed refresh does not retain verified amount ${locale}`,async({page})=>{
  const state=await fixture(page,locale,'complete');const card=page.getByRole('article',{name:'Fixture staff A'});await expect(card).toContainText(/[¥￥]1,200/);
  state.setFail(true);await page.getByRole('button',{name:'Refresh fixture'}).click();await expect(card).toContainText('Fixture unavailable');
  await expect(card.getByLabel(locale==='ja'?'給与総額は未確定':'Full pay unavailable')).toContainText('—');
 });
}
