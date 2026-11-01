import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import ts from "typescript";

// Exercise the actual rendering gate, without copying its financial logic.
const source=readFileSync(new URL("../src/pages/NoriMonthlySummary.tsx",import.meta.url),"utf8");
const gate=source.slice(source.indexOf("function ownerAmount("),source.indexOf("function verifiedYen("));
const mod={exports:{}};
runInNewContext(ts.transpileModule("export "+gate,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
  {module:mod,exports:mod.exports});
const {ownerAmount}=mod.exports;
const complete={amount_yen:350000,status:"estimate",complete:true,blockers:[],
  source:"monthly_revenue_less_recorded_staff_earnings",basis:"before_other_expenses"};

test("owner amount uses signed authoritative server values, never named-card arithmetic",()=>{
  for(const amount_yen of [0,-25000,350000]) assert.equal(ownerAmount({...complete,amount_yen}),amount_yen);
});
test("every source, completeness and expense-basis gate must hold",()=>{
  for(const override of [{status:"incomplete"},{status:"unavailable"},{complete:false},{complete:undefined},
    {blockers:["staff_hours_unverified"]},{source:null},{source:"sales"},{basis:undefined},{basis:"net_profit"}]) {
    assert.equal(ownerAmount({...complete,...override}),null);
  }
});
test("missing or unsafe monetary values remain unknown",()=>{
  for(const amount_yen of [null,undefined,NaN,Infinity,-Infinity,0.5,Number.MAX_SAFE_INTEGER+1,"350000"]) {
    assert.equal(ownerAmount({...complete,amount_yen}),null);
  }
});
test("legacy unavailable owner response remains supported",()=>{
  assert.equal(ownerAmount({amount_yen:null,status:"unavailable",source:null,blockers:["owner_income_rule_unconfirmed"]}),null);
});
