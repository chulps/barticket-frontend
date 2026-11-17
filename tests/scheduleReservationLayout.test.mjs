import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const schedule = readFileSync(new URL('../src/pages/Schedules.tsx', import.meta.url), 'utf8');
test('week stacks shift and reservation status within the same content column', () => {
  assert.match(schedule, /<WeekContent>[\s\S]*?<WeekEvent[\s\S]*?<ReservationIndicator[\s\S]*?<\/WeekContent>/);
  assert.match(schedule, /const WeekContent = styled\.div`[^`]*flex-direction:column/);
});
test('month status has compact visual labels and a full accessible name', () => {
  assert.match(schedule, /<MonthReservationIndicator[^\n]*aria-label=\{reservationLabel\(day, counts\)\}/);
  assert.match(schedule, /className="compact-label" aria-hidden="true"/);
  assert.match(schedule, /counts\.history \?[^\n]*hist\./);
  assert.match(schedule, /canceled or declined/);
});
test('floating create keeps a scrollable clearance for page controls', () => {
  assert.match(schedule, /!managerReviewOpen \? <CreateButton/);
  assert.match(schedule, /const CreateButton = styled\.button`position:fixed/);
  assert.match(schedule, /padding:16px 0 calc\(160px \+ env\(safe-area-inset-bottom/);
  assert.match(schedule, /scroll-margin-bottom:calc\(112px \+ env\(safe-area-inset-bottom/);
});

test('month request labels truncate within the cell while retaining full detail access', () => {
  assert.match(schedule, /<MonthReservationIndicator[^\n]*aria-label=\{reservationLabel\(day, counts\)\} title=\{reservationLabel\(day, counts\)\}/);
  assert.match(schedule, /\.full-label,\.compact-label > span\{[^}]*overflow:hidden;white-space:nowrap;text-overflow:ellipsis;/);
  assert.match(schedule, /const MonthReservationIndicator = styled\(ReservationIndicator\)`[^`]*overflow:hidden;/);
  assert.match(schedule, /selectedReservations\.map\(request =>/);
});


test('canceled reservation badge uses danger tokens without changing other statuses', () => {
  const badge = schedule.match(/const StatusBadge = styled\.span[^`]*`([^`]*)`;/)?.[1];
  assert.ok(badge);
  assert.match(badge, /\$status==="canceled"\?"border:1px solid var\(--danger-500\);":""/);
  assert.match(badge, /background:\$\{p=>p\.\$status==="pending"\?"var\(--warning-950\)":p\.\$status==="approved"\?"var\(--success-950\)":p\.\$status==="canceled"\?"var\(--danger-950\)":"var\(--neutral-800\)"\}/);
  assert.match(badge, /color:\$\{p=>p\.\$status==="pending"\?"var\(--warning-200\)":p\.\$status==="approved"\?"var\(--success-200\)":p\.\$status==="canceled"\?"var\(--danger-200\)":"var\(--neutral-300\)"\}/);
});

test('pending and confirmed reservation badges use matching semantic outlines', () => {
  const badge = schedule.match(/const StatusBadge = styled\.span[^`]*`([^`]*)`;/)?.[1];
  assert.ok(badge);
  assert.match(badge, /\$status==="pending"\?"border:1px solid var\(--warning-500\);":p\.\$status==="approved"\?"border:1px solid var\(--success-500\);":""/);
  assert.match(schedule, /request\.status === "approved" \? "Confirmed" : request\.status\[0\]\.toUpperCase\(\) \+ request\.status\.slice\(1\)/);
  assert.match(schedule, /approved: "確定"/);
});
