import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const code = readFileSync(new URL("../src/components/selectorNavigation.ts", import.meta.url), "utf8");
const output = ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
}}).outputText;
const mod = { exports: {} };
runInNewContext(output, { module: mod, exports: mod.exports });
const { nextSelectorIndex } = mod.exports;
const tab = readFileSync(new URL("../src/components/TabGroup.tsx", import.meta.url), "utf8");
const payment = readFileSync(new URL("../src/components/PaymentModal.tsx", import.meta.url), "utf8");

test("arrow navigation wraps and Home/End jump to edges", () => {
  assert.equal(nextSelectorIndex(2, 3, "ArrowRight"), 0);
  assert.equal(nextSelectorIndex(0, 3, "ArrowLeft"), 2);
  assert.equal(nextSelectorIndex(1, 3, "ArrowDown"), 2);
  assert.equal(nextSelectorIndex(1, 3, "ArrowUp"), 0);
  assert.equal(nextSelectorIndex(2, 3, "Home"), 0);
  assert.equal(nextSelectorIndex(0, 3, "End"), 2);
});
test("native tab, enter and space retain their normal meaning", () => {
  assert.equal(nextSelectorIndex(1, 3, "Tab"), null);
  assert.equal(nextSelectorIndex(1, 3, "Enter"), null);
  assert.equal(nextSelectorIndex(1, 3, " "), null);
  assert.equal(nextSelectorIndex(0, 0, "ArrowRight"), null);
});
test("ticket/admin toggle groups keep pressed semantics and Schedule can use true tabs", () => {
  assert.match(tab, /semantics = "group"/);
  assert.match(tab, /role=\{semantics === "tabs" && !trailingAction \? "tablist" : "group"\}/);
  assert.match(tab, /aria-pressed=\{semantics === "group" \? tab\.id === activeTab : undefined\}/);
  assert.match(tab, /aria-selected=\{semantics === "tabs" \? tab\.id === activeTab : undefined\}/);
  assert.match(tab, /tabIndex=\{semantics === "tabs" \? \(tab\.id === activeTab \? 0 : -1\) : undefined\}/);
  assert.match(tab, /aria-controls=\{semantics === "tabs" && idPrefix/);
  assert.match(tab, /onKeyDown=\{event => handleArrow\(event, index\)\}/);
  assert.match(tab, /button\.getBoundingClientRect/);
  assert.match(tab, /button\.offsetLeft/);
  assert.match(tab, /overflow-x: auto/);
  assert.match(tab, /scroller\.scrollTo/);
  assert.match(tab, /prefers-reduced-motion: reduce/);
  assert.match(payment, /role="group" aria-label=\{t\("receivePayment"\)\}/);
  assert.match(payment, /aria-pressed=\{paymentType === method\.type\}/);
  assert.match(payment, /onKeyDown=\{event => handleMethodArrow\(event, index\)\}/);
});
test("Schedule associates Month Week and Day panels with genuine shared tabs", () => {
  const schedule = readFileSync(new URL("../src/pages/Schedules.tsx", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/pages/ScheduleEditor.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/api/scheduledShifts.ts", import.meta.url), "utf8");
  const tokens = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(schedule, /semantics="tabs"/);
  assert.match(schedule, /role="tabpanel" aria-labelledby="schedule-view-tab-month"/);
  assert.match(schedule, /role="tabpanel" aria-labelledby=\{`schedule-view-tab-\$\{mode\}`\}/);
  assert.doesNotMatch(schedule, /trailingAction=/);
  assert.match(schedule, /id: "day" as const, label: t\("Day", "日"\)/);
  assert.doesNotMatch(schedule, /TodayButton/);
  assert.match(tab, /<TabButton type="button" \$active=\{false\} onClick=\{trailingAction.onClick\}/);
  assert.match(schedule, /detailReturnFocus\.current\?\.focus\(\)/);
  assert.match(schedule, /const selectedIsPast = \(selected < calendarDate && !isActiveShiftDate\(selected\)\)/);
  assert.match(schedule, /const createTargetIsPast = \(createTarget < calendarDate && !isActiveShiftDate\(createTarget\)\)/);
  assert.match(schedule, /const Page = styled\.main`width:100%;/);
  assert.match(schedule, /Past schedule dates are read-only/);
  assert.match(editor, /<input disabled=\{!canWrite \|\| busy\} type="date" min=\{today\}/);
  assert.match(editor, /dateIsPast \|\| sourceDateIsPast/);
  assert.match(schedule, /operational_business_date/);
  assert.match(schedule, /const managerReviewOpen = viewer\?\.role === "manager" && detail && selectedTimeOff\.some\(item => item\.status === "pending"\)/);
  assert.match(schedule, /!managerReviewOpen \? <CreateButton/);
  assert.match(schedule, /actual_shift_status === "open"/);
  assert.match(schedule, /actual_shift_status === "closed"/);
  assert.match(schedule, /const requestContext = \(rerunInFlight = true\) =>/);
  assert.match(schedule, /requestContext\(false\);/);
  assert.match(schedule, /contextEffectActive.current = true/);
  assert.match(schedule, /contextEffectActive.current = false/);
  assert.equal(schedule.includes("if (contextFlight.current?.session === session) contextFlight.current = null"), false);
  assert.match(schedule, /document\.hidden \|\| !navigator\.onLine/);
  assert.match(schedule, /setScheduleContext\(null\)/);
  assert.match(schedule, /contextFlight\.current !== flight/);
  assert.match(schedule, /operational_business_date/);
  assert.match(schedule, /calendar_business_date/);
  assert.match(schedule, /const scheduleType = row\.schedule_type \?\?/);
  assert.match(schedule, /if \(row\.venue_status === "closed" \|\| scheduleType === "closed"\) return "closed"/);
  assert.match(editor, /<option value="open">/);
  assert.match(editor, /<option value="event">/);
  assert.match(editor, /<option value="closed">/);
  assert.match(editor, /Add notes describing the event/);
  assert.match(schedule, /var\(--success\)/);
  assert.match(schedule, /var\(--danger\)/);
  assert.match(schedule, /var\(--info\)/);
  assert.match(schedule, /Active shift/);
  assert.match(schedule, /Finished shift/);
  assert.match(api, /"\/schedules\/context"/);
  assert.match(tokens, /--event-400:/);
  assert.match(schedule, /height:44px/);
  assert.doesNotMatch(schedule, /max-width:370px\)\{min-width:36px/);
});
test("all updated typescript parses", () => {
  const schedule = readFileSync(new URL("../src/pages/Schedules.tsx", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/pages/ScheduleEditor.tsx", import.meta.url), "utf8");
  for (const [path, source] of [["TabGroup.tsx",tab],["PaymentModal.tsx",payment],["Schedules.tsx",schedule],["ScheduleEditor.tsx",editor]]) {
    const parsed = ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    assert.deepEqual(parsed.parseDiagnostics.map(d=>d.messageText),[]);
  }
});
