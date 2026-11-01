import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const src = path => readFileSync(new URL("../src/" + path, import.meta.url), "utf8");
const output = ts.transpileModule(src("pages/shiftControlPolicy.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
runInNewContext(output, { module: mod, exports: mod.exports, Intl, Date });
const { businessDateJst, shouldPromptNoonReview, currentPunch, workedSeconds, closeBlockers, previewPaidTotals, canManageShift, isReadinessForShift } = mod.exports;

test("close readiness is trusted only for the selected shift", () => {
    assert.equal(isReadinessForShift({ shift: { id: 12 } }, 12), true);
    assert.equal(isReadinessForShift(null, 12), false);
    assert.equal(isReadinessForShift({ shift: null }, 12), false);
    assert.equal(isReadinessForShift({ shift: { id: 11 } }, 12), false);
    const review = src("pages/ShiftCloseReview.tsx");
    assert.match(review, /Close readiness could not be verified/);
    assert.match(review, /閉店情報を確認できません/);
    assert.match(review, /Carried balance/);
    assert.match(review, /繰越残高/);
});

test("business day rolls at noon JST, never at midnight", () => {
    assert.equal(businessDateJst(Date.parse("2026-10-16T14:59:59Z")), "2026-10-16"); // 23:59 JST
    assert.equal(businessDateJst(Date.parse("2026-10-16T15:00:00Z")), "2026-10-16"); // 00:00 JST
    assert.equal(businessDateJst(Date.parse("2026-10-17T02:59:59Z")), "2026-10-16"); // 11:59 JST
    assert.equal(businessDateJst(Date.parse("2026-10-17T03:00:00Z")), "2026-10-17"); // noon JST
});

test("manager noon review starts at 11:30 JST for the active business date", () => {
    const businessDate = "2026-10-16";
    assert.equal(shouldPromptNoonReview(Date.parse("2026-10-17T02:29:00Z"), businessDate), false);
    assert.equal(shouldPromptNoonReview(Date.parse("2026-10-17T02:30:00Z"), businessDate), true);
    assert.equal(shouldPromptNoonReview(Date.parse("2026-10-17T02:59:00Z"), businessDate), true);
    assert.equal(shouldPromptNoonReview(Date.parse("2026-10-17T03:00:00Z"), businessDate), false);
    assert.equal(shouldPromptNoonReview(Date.parse("2026-10-17T02:30:00Z"), "2026-10-17"), false);
});

test("clock status and elapsed time come from recorded punches, including multiple intervals", () => {
    const shift = { punches: [
        { user_id: 3, name: "Staff", clock_in: 1000, clock_out: 2800 },
        { user_id: 3, name: "Staff", clock_in: 3000, clock_out: null },
        { user_id: 4, name: "Other", clock_in: 2000, clock_out: null },
    ] };
    assert.equal(currentPunch(shift, 3)?.clock_in, 3000);
    assert.equal(workedSeconds(shift, 3, 6600), 5400);
    assert.equal(currentPunch(shift, 5), null);
    assert.equal(workedSeconds(null, 3, 6600), 0);
});

test("pre-close preview blocks unresolved tickets until backend provides scoped readiness", () => {
    const rows = [
        { id: 1, shift_id: 21, status: "open" },
        { id: 2, shift_id: 20, status: "open" },
        { id: 3, shift_id: 21, status: "paid" },
    ];
    assert.deepEqual(Array.from(closeBlockers(rows)).map(ticket => ticket.id), [1, 2]);
});

test("previewed paid totals only use paid tickets from the current shift", () => {
    const rows = [
        { shift_id: 4, status: "paid", total: 700, payment: { type: "cash" } },
        { shift_id: 4, status: "paid", total: 900, payment: { type: "card" } },
        { shift_id: 4, status: "paid", total: 300, payment: { type: "other" } },
        { shift_id: 4, status: "open", total: 1000, payment: null },
        { shift_id: 3, status: "paid", total: 5000, payment: { type: "cash" } },
    ];
    const result = previewPaidTotals(rows, 4);
    assert.equal(result.paidTotal, 1900);
    assert.equal(result.cash, 700);
    assert.equal(result.card, 900);
    assert.equal(result.other, 300);
    assert.equal(result.paidCount, 3);
});

test("authenticated staff and managers can manage venue shifts", () => {
    assert.equal(canManageShift("staff"), true);
    assert.equal(canManageShift("manager"), true);
    assert.equal(canManageShift("visitor"), false);
});

test("close POST is called only from reviewed explicit confirmation", () => {
    const profile = src("pages/Profile.tsx");
    const timeClock = src("pages/ShiftControls.tsx");
    const review = src("pages/ShiftCloseReview.tsx");
    assert.doesNotMatch(profile, /accountApi\.closeShift\(/);
    assert.doesNotMatch(timeClock, /accountApi\.closeShift\(/);
    assert.match(review, /if \(!preview \|\| !readinessMatches \|\| blockers\.length \|\| !acknowledged \|\| working \|\| uncertain \|\| submitInFlight\.current\) return/);
    assert.match(review, /submitInFlight\.current = true/);
    assert.match(review, /err\.status >= 500/);
    assert.match(review, /onClick=\{\(\) => void confirmClose\(\)\}/);
    assert.match(review, /const \[latest, latestTickets, ready\] = await Promise\.all/);
    assert.match(review, /if \(!ready\.can_close \|\| closeBlockers\(latestTickets\)\.length\)/);
    assert.match(review, /isReadinessForShift\(ready, shiftId\)/);
    assert.match(review, /verifiedReadiness/);
    assert.match(review, /!readinessMatches/);
    assert.match(review, /accountApi\.closeShift\(shiftId\)/);
    assert.match(review, /registerCloseGuard\(\(\) => !working && !submitInFlight\.current\)/);
    assert.match(review, /allowKeepOpen/);
    assert.match(review, /accountApi\.keepShiftOpen\(shiftId, reason\)/);
    const header = src("layout/Header.tsx");
    assert.match(header, /shouldPromptNoonReview/);
    assert.match(header, /barticket:noon-review/);
    assert.match(header, /allowKeepOpen/);
});

test("shift control reloads after focus/remote events without automatically retrying POST", () => {
    const control = src("pages/ShiftControls.tsx");
    assert.match(control, /startBackgroundRefresh/);
    assert.match(src("hooks/backgroundRefresh.ts"), /"focus"/);
    assert.match(control, /events: \["barticket-auth", "barticket-shift-updated"/);
    assert.match(control, /version\.current/);
    assert.match(control, /mutation\.current/);
    assert.match(control, /void refresh\(\)/);
    assert.doesNotMatch(control, /setInterval\(\(\) => void perform/);
});

test("shift review and policy files parse as TSX/TS", () => {
    for (const file of ["pages/Profile.tsx","pages/ShiftControls.tsx","pages/ShiftCloseReview.tsx","pages/shiftControlPolicy.ts"]) {
        const isTsx = file.endsWith(".tsx");
        const parsed = ts.createSourceFile(file, src(file), ts.ScriptTarget.Latest, true,
            isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        assert.deepEqual(parsed.parseDiagnostics.map(d => d.messageText), [], file);
    }
});

test("tickets provides an explicit read-only time clock status and profile entry point", () => {
    const dashboard = src("pages/Dashboard.tsx");
    assert.match(dashboard, /<ShiftStatusBar role="status" aria-live="polite">/);
    assert.match(dashboard, /<Link to="\/profile\?section=shift">/);
    assert.match(dashboard, /Shift status unverified/);
});

test("start, join, reopen and stale recovery follow the backend shift contract", () => {
    const control = src("pages/ShiftControls.tsx");
    const account = src("api/account.ts");
    assert.match(control, /result\.operation === "joined"/);
    assert.match(control, /Started a new shift/);
    assert.match(control, /action === "reopen" && \(account\.role !== "manager"/);
    assert.match(control, /conflict\?\.code === "STALE_OPEN_SHIFT"/);
    assert.match(control, /action === "open" && \(shift \|\| stale \|\| closedToday \|\| eligibility !== "allowed"\)/);
    assert.match(control, /Could not verify shift history/);
    assert.match(control, /lookup\.status === "ready" && !shift && !staleInfo/);
    assert.match(account, /reopenShift: [\s\S]*?confirmed: true, reason/);
    assert.match(account, /shiftHistory: .*"\/shifts"/);
    assert.match(control, /Previous shift needs review/);
    assert.match(control, /Review & recover shift/);
    assert.match(control, /Clock in after the shift opens/);
});

test("uncertain writes reconcile server state without replay; permission failures are localized", () => {
    const control = src("pages/ShiftControls.tsx");
    assert.match(control, /err\.status === 408 \|\| err\.status >= 500/);
    assert.match(control, /this action will not be resent automatically/);
    assert.match(control, /refresh\(\)/);
    assert.match(control, /err\.status === 401/);
    assert.match(control, /err\.status === 403/);
    assert.match(control, /Only a manager can reopen a shift/);
    assert.match(control, /このアカウントでは操作が許可されていません/);
    assert.match(control, /setPending\(action\)/);
    assert.match(control, /setPending\(""\)/);
});

