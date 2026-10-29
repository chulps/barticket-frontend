import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const s = readFileSync(new URL("../src/pages/AdminTeamEditors.tsx", import.meta.url), "utf8");

test("staff editor uses the confirmed 40% drink rule and saves audited bonus corrections", () => {
    assert.match(s, /40% of listed price/);
    assert.match(s, /fully paid tickets/);
    assert.doesNotMatch(s, /propose-drinkback-rule|Propose staff-drink bonus rule/);
    assert.match(s, /saveBonusAdjustment/);
    assert.match(s, /createStaffDrinkBonusAdjustment/);
    assert.match(s, /idempotency_key: bonusIdempotencyKey\.current/);
    assert.match(s, /Adjustment preview/);
    assert.match(s, /Bonus adjustment history/);
    assert.doesNotMatch(s, /copyBonusAdjustmentProposal|UNSAVED_PROPOSAL_ONLY|navigator\\.clipboard/);
});
test("hourly rates require a current preview and an explicit save confirmation", () => {
    assert.match(s, /disabled=\{!readyRate \|\| rateLoading \|\| !!rateError \|\| !previewMatchesRate \|\| savingRate\}/);
    assert.match(s, /window\.confirm/);
    assert.match(s, /Confirm and save/);
    assert.doesNotMatch(s, /accountApi\.(?:updatePay|saveHours|saveBonus)/);
    assert.match(s, /Save adjustment/);
});
test("staff editor continues to parse correctly", () => {
    const ast = ts.createSourceFile("AdminTeamEditors.tsx", s, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    assert.deepEqual(ast.parseDiagnostics.map(d => d.messageText), []);
});
