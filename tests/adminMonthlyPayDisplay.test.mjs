import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/pages/adminMonthlyPayDisplay.ts',import.meta.url),'utf8');
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
const {staffPayRow,managerPayRow,totalStaffPay}=await import('data:text/javascript,'+encodeURIComponent(outputText));
const person={id:903,name:'Fixture staff',role:'staff'};
const coverage=status=>({staff_drink_data_status:status,final_pay_complete:status==='complete',recorded_inputs_only:status!=='complete'});
function report(status='complete',wages='1000',bonus=200){return {user_id:903,month:'2026-10',preview_only:true,...coverage(status),categories:[{category:'hourly_wages',complete:true,amount_yen_unrounded:wages,entries:[]},{category:'staff_drink_bonus',...coverage(status),complete:status!=='incomplete',amount_yen:bonus,entries:[]}],note:'Fixture'};}
for(const status of ['unknown','incomplete']) test(`Admin recorded ${status} bonuses cannot become full pay`,()=>{
 const data=report(status,'1000',0);const row=staffPayRow(person,data);
 assert.equal(row.complete,false);assert.equal(row.owed,null);assert.equal(row.total,null);
 assert.equal(row.wages,1000);assert.equal(row.bonus,0);assert.equal(row.message,`drinks_${status}`);
 assert.equal(totalStaffPay([row]),null);
});
test('Verified amounts including genuine zero retain exact displayed estimate',()=>{
 for(const [wage,bonus,expected] of [['1000.25',200,1200.25],['0',0,0],['1000',-200,800]]){
  const row=staffPayRow(person,report('complete',wage,bonus));assert.equal(row.complete,true);assert.equal(row.owed,expected);assert.equal(totalStaffPay([row]),expected);
 }
});
test('Missing old-server metadata never certifies a complete month',()=>{
 const data=report();for(const key of Object.keys(coverage('complete'))){delete data[key];delete data.categories[1][key];}
 const row=staffPayRow(person,data);assert.equal(row.complete,false);assert.equal(row.owed,null);assert.equal(row.bonus,200);
});
test('Any explicit contradictory coverage flag prevents final totals',()=>{
 for(const location of ['report','bonus'])for(const patch of [{final_pay_complete:false},{recorded_inputs_only:true},{staff_drink_data_status:'unknown'},{staff_drink_data_status:'incomplete'}]){
  const data=report();Object.assign(location==='report'?data:data.categories[1],patch);
  assert.equal(staffPayRow(person,data).owed,null,JSON.stringify({location,patch}));
 }
});
test('Wage-only and combined gaps are distinct from bonus-only incompleteness',()=>{
 const wageOnly=report();wageOnly.final_pay_complete=false;wageOnly.categories[0].complete=false;wageOnly.categories[0].amount_yen_unrounded=null;
 assert.equal(staffPayRow(person,wageOnly).message,'wages_unverified');
 const both=report('incomplete');both.categories[0].complete=false;
 assert.equal(staffPayRow(person,both).message,'wages_and_drinks_unverified');
});
test('Malformed or absent amounts are unavailable, never zero or NaN',()=>{
 for(const value of [null,undefined,'', '  ','oops',NaN,Infinity]){
  const data=report();data.categories[0].amount_yen_unrounded=value;
  assert.equal(staffPayRow(person,data).wages,null);assert.equal(staffPayRow(person,data).owed,null);
  const drinks=report();drinks.categories[1].amount_yen=value;
  assert.equal(staffPayRow(person,drinks).bonus,null);assert.equal(staffPayRow(person,drinks).owed,null);
 }
 const missing=report();missing.categories=[];assert.equal(staffPayRow(person,missing).owed,null);
});
test('Mixed team never presents a partial total as complete; managers excluded',()=>{
 const verified=staffPayRow(person,report());const unknown=staffPayRow({...person,id:904},report('unknown'));
 assert.equal(totalStaffPay([verified,unknown]),null);assert.equal(totalStaffPay([]),null);
 assert.equal(totalStaffPay([verified,{...unknown,person:{id:901,role:'manager'}}]),1200);
});
test('Manager legacy complete flag cannot bypass unknown drink coverage',()=>{
 const data={...coverage('unknown'),complete:true,net_amount_owed_yen:1200,gross_salary_yen:2000,staff_cost_total_yen:700,recorded_staff_cost_total_yen:600,deduction_total_yen:100,blockers:[],staff_owed:[],deductions:[]};
 const row=managerPayRow({id:901,role:'manager'},data);assert.equal(row.owed,null);assert.equal(row.complete,false);assert.equal(row.staffCost,600);assert.equal(row.message,'pay_coverage_unverified');
 assert.equal(managerPayRow(row.person,{...data,...coverage('complete')}).owed,1200);
 for(const key of Object.keys(coverage('complete'))){const legacy={...data,...coverage('complete')};delete legacy[key];assert.equal(managerPayRow(row.person,legacy).owed,null);}
 assert.equal(managerPayRow(row.person,{...data,...coverage('complete'),complete:false,blockers:['staff_hours_unverified']}).owed,null);
});

test('Manager actual incomplete response retains recorded costs without final pay',()=>{
 const data={...coverage('incomplete'),complete:false,net_amount_owed_yen:null,gross_salary_yen:2000,staff_cost_total_yen:null,recorded_staff_cost_total_yen:700,deduction_total_yen:100,blockers:['staff_drink_data_incomplete','staff_payroll_costs_incomplete']};
 const row=managerPayRow({id:901,role:'manager'},data);assert.equal(row.owed,null);assert.equal(row.staffCost,700);assert.equal(row.message,data.blockers.join(', '));
 for(const net of [null,undefined,'','invalid',Infinity])assert.equal(managerPayRow(row.person,{...data,...coverage('complete'),complete:true,blockers:[],net_amount_owed_yen:net}).owed,null);
 assert.equal(managerPayRow(row.person,{...data,...coverage('complete'),complete:true,blockers:[],net_amount_owed_yen:0}).owed,0);
 assert.equal(managerPayRow(row.person,{...data,...coverage('complete'),complete:true,net_amount_owed_yen:1200}).owed,null);
});
