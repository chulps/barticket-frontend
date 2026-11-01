import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/pages/chuckPayBreakdown.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {buildChuckPayBreakdown}=await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const fixture=()=>({complete:true,gross_salary_yen:10000,net_amount_owed_yen:6500,staff_cost_total_yen:3000,deduction_total_yen:500,
  staff_owed:[{user_id:11,name:'Staff A',wages_yen:800,staff_drink_bonus_yen:200,total_owed_yen:1000},{user_id:12,name:'Staff B',wages_yen:1800,staff_drink_bonus_yen:200,total_owed_yen:2000}],
  deductions:[{id:1,category:'manager_pay_deduction',amount_yen:1000},{id:2,category:'manager_pay_deduction',amount_yen:-500,reversal_of_id:1}]});
test('separates staff by identity and uses signed ledger exactly once',()=>{
  const result=buildChuckPayBreakdown(fixture());assert.equal(result.retained,6500);assert.equal(result.inconsistent,false);
  assert.deepEqual(result.staff.map(x=>[x.id,x.wages,x.drinks,x.total]),[[11,800,200,1000],[12,1800,200,2000]]);
  assert.equal(result.deductions.length,2); // Same amounts across wages/ledger never imply duplication.
});
test('unknown inputs do not turn partial totals into retained pay',()=>{
  for(const report of [{...fixture(),complete:false},{...fixture(),staff_owed:[{user_id:11,name:'A',wages_yen:null,staff_drink_bonus_yen:0,total_owed_yen:null}]}])assert.equal(buildChuckPayBreakdown(report).retained,null);
});
test('inconsistent totals fail closed without recomputing new payable amount',()=>{
  for(const change of [{staff_cost_total_yen:3001},{deduction_total_yen:501},{net_amount_owed_yen:6501}]) {
    const result=buildChuckPayBreakdown({...fixture(),...change});assert.equal(result.retained,null);assert.equal(result.inconsistent,true);
  }
});
test('verified zero is preserved; empty incomplete month and negative-review balances remain unknown',()=>{
  assert.equal(buildChuckPayBreakdown({complete:true,gross_salary_yen:0,staff_cost_total_yen:0,deduction_total_yen:0,net_amount_owed_yen:0,staff_owed:[],deductions:[]}).retained,0);
  assert.equal(buildChuckPayBreakdown({...fixture(),complete:false,net_amount_owed_yen:null,calculated_balance_yen:-500}).retained,null);
  assert.equal(buildChuckPayBreakdown({complete:false,gross_salary_yen:null,staff_cost_total_yen:0,deduction_total_yen:0,net_amount_owed_yen:null,staff_owed:[],deductions:[]}).retained,null);
});

test('a negative net is never presented as retained pay even in an inconsistent complete response',()=>{
  const result=buildChuckPayBreakdown({...fixture(),complete:true,net_amount_owed_yen:-1000,deduction_total_yen:8000,deductions:[{id:1,amount_yen:8000}]});
  assert.equal(result.retained,null);assert.equal(result.inconsistent,true);
});

test('donut components split wages and recorded drinks exactly once with stable person IDs',()=>{
 const r=buildChuckPayBreakdown(fixture());
 assert.deepEqual(r.staffSlices.map(x=>[x.id,x.kind,x.value]),[['staff-11-wages','wages',800],['staff-11-drinks','drinks',200],['staff-12-wages','wages',1800],['staff-12-drinks','drinks',200]]);
 assert.equal(r.staffSlices.reduce((s,x)=>s+x.value,0),3000);
});
test('explicit missing drinks suppresses legacy complete net but preserves recorded component data',()=>{
 for(const change of [{staff_drink_data_status:'incomplete'},{blockers:['staff_drink_data_incomplete']}]){
  const r=buildChuckPayBreakdown({...fixture(),...change});assert.equal(r.retained,null);assert.equal(r.staffSlices.length,4);assert.equal(r.staff[0].drinks,200);
 }
});
test('unknown coverage keeps a recorded estimate, never fabricates missing bonus values',()=>{
 const r=buildChuckPayBreakdown({...fixture(),staff_drink_data_status:'unknown'});assert.equal(r.retained,6500);assert.equal(r.staff[0].drinks,200);
});
test('signed or unknown components never distort a donut; mismatched sums fail closed',()=>{
 for(const row of [{wages_yen:-100,staff_drink_bonus_yen:1100,total_owed_yen:1000},{wages_yen:null,staff_drink_bonus_yen:1000,total_owed_yen:1000},{wages_yen:800,staff_drink_bonus_yen:201,total_owed_yen:1000}]){
 const r=buildChuckPayBreakdown({...fixture(),staff_owed:[{...fixture().staff_owed[0],...row},fixture().staff_owed[1]]});assert.deepEqual(r.staffSlices,[]);
 }
});
test('explicit recorded subtotals survive nulled final totals without becoming final',()=>{
 const f=fixture();const r=buildChuckPayBreakdown({...f,staff_drink_data_status:'incomplete',staff_cost_total_yen:null,recorded_staff_cost_total_yen:3000,net_amount_owed_yen:null,complete:false,staff_owed:f.staff_owed.map(x=>({...x,recorded_total_yen:x.total_owed_yen,total_owed_yen:null}))});
 assert.equal(r.retained,null);assert.equal(r.recordedStaffCost,3000);assert.equal(r.staffSlices.length,4);
 assert.equal(buildChuckPayBreakdown({...f,staff_drink_data_status:'incomplete',recorded_staff_cost_total_yen:null}).recordedStaffCost,null);
});
