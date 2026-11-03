import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/pages/Schedules.tsx', import.meta.url), 'utf8');
const transpile = text => ts.transpile(text, { target: ts.ScriptTarget.ES2022 });
const palette = source.slice(source.indexOf('type ScheduleState ='), source.indexOf('const store ='));
const { scheduleAccent, scheduleForeground, scheduleSurface } = new Function(transpile(palette) + '\nreturn { scheduleAccent, scheduleForeground, scheduleSurface };')();
const classifier = source.slice(source.indexOf('    const cellState ='), source.indexOf('    const cellTitle ='));
const { cellState, cellLabel } = new Function('calendarDate', 't', transpile(classifier) + '\nreturn { cellState, cellLabel };')('2026-11-17', en => en);
const row = overrides => ({ business_date: '2026-11-18', actual_shift_status: null, venue_status: null, event_value: 'Open', schedule_type: 'open', schedule_state: 'upcoming', ...overrides });

test('schedule accents use existing success, primary, info and danger semantics', () => {
    for (const [state, accent, foreground, surface] of [
        ['active', 'success', 'success-300', 'success-900'],
        ['planned', 'primary', 'royal-300', 'royal-900'],
        ['event', 'info', 'info-300', 'info-900'],
        ['closed', 'danger', 'danger-300', 'danger-900'],
        ['finished', 'neutral-500', 'neutral-300', 'neutral-900'],
        ['past', 'neutral-500', 'neutral-300', 'neutral-900'],
    ]) {
        assert.equal(scheduleAccent(state), `var(--${accent})`);
        assert.equal(scheduleForeground(state), `var(--${foreground})`);
        assert.equal(scheduleSurface(state), `var(--${surface})`);
    }
    assert.equal((source.match(/border-left:3px solid \$\{p=>scheduleAccent\(p\.\$state\)\}/g) ?? []).length, 3);
    assert.equal((source.match(/color:\$\{p=>scheduleForeground\(p\.\$state\)\}/g) ?? []).length, 3);
    assert.doesNotMatch(source, /--event-400/);
});

test('actual running wins even overnight; actual finished and past plans stay grey', () => {
    assert.equal(cellState(row({ business_date: '2026-11-16', actual_shift_status: 'open', venue_status: 'closed' })), 'active');
    assert.equal(cellState(row({ actual_shift_status: 'closed', schedule_type: 'event' })), 'finished');
    for (const overrides of [{}, { venue_status: 'closed' }, { schedule_type: 'closed' }, { schedule_type: 'event' }, { event_value: 'Live music', schedule_type: undefined }]) {
        assert.equal(cellState(row({ ...overrides, business_date: '2026-11-16' })), 'past');
    }
    assert.equal(cellLabel(row({ business_date: '2026-11-16', venue_status: 'closed' })), 'Past · Closed');
    assert.equal(cellLabel(row({ business_date: '2026-11-16', event_value: 'Closed', schedule_type: undefined })), 'Past · Closed');
    assert.equal(cellLabel(row({ business_date: '2026-11-16', schedule_type: 'event' })), 'Past');
});

test('current and future ordinary, event and closed plans keep truthful non-actual states', () => {
    for (const day of ['2026-11-17', '2026-11-18']) {
        assert.equal(cellState(row({ business_date: day })), 'planned');
        assert.equal(cellLabel(row({ business_date: day })), 'Planned shift');
        assert.equal(cellState(row({ business_date: day, schedule_type: 'event' })), 'event');
        assert.equal(cellState(row({ business_date: day, venue_status: 'closed' })), 'closed');
        assert.equal(cellState(row({ business_date: day, schedule_type: 'closed' })), 'closed');
        assert.equal(cellLabel(row({ business_date: day, schedule_type: 'closed' })), 'Closed');
    }
});
