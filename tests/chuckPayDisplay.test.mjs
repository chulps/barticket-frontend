import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/pages/chuckPayDisplay.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { chuckPayDisplay } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("incomplete legacy responses never display a numeric net estimate", () => {
    for (const blocker of ["staff_hours_unverified", "staff_hourly_rate_missing", "unattributed_staff_drink", "unassigned_staff_history", "staff_payroll_costs_incomplete"]) {
        assert.deepEqual(chuckPayDisplay({ complete: false, net_amount_owed_yen: 10000, blockers: [blocker] }),
            { netAmount: null, staffSubtotalPartial: true });
    }
});
test("manager assignment uncertainty still withholds net without mislabeling known staff costs", () => {
    assert.deepEqual(chuckPayDisplay({ complete: false, net_amount_owed_yen: 10000, blockers: ["working_manager_unassigned"] }),
        { netAmount: null, staffSubtotalPartial: false });
});
test("complete estimates preserve real zero and positive amounts", () => {
    for (const netAmount of [0, 10000]) assert.deepEqual(chuckPayDisplay({ complete: true, net_amount_owed_yen: netAmount, blockers: [] }),
        { netAmount, staffSubtotalPartial: false });
});
test('explicit drink incompleteness overrides complete=true without blanking unknown months',()=>{
 for(const change of [{staff_drink_data_status:'incomplete'},{blockers:['staff_drink_data_incomplete']}])assert.deepEqual(chuckPayDisplay({complete:true,net_amount_owed_yen:10000,blockers:[],...change}),{netAmount:null,staffSubtotalPartial:true});
 assert.equal(chuckPayDisplay({complete:true,net_amount_owed_yen:10000,blockers:[],staff_drink_data_status:'unknown'}).netAmount,10000);
});
