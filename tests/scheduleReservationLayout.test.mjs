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
