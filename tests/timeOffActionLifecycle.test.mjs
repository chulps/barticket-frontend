import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/Schedules.tsx', import.meta.url), 'utf8');
const start = source.indexOf('    const submitTimeOff = async () => {');
const end = source.indexOf('    const days = calendarDays(month);', start);
assert.ok(start >= 0 && end > start);
const handlersSource = ts.transpile(`${source.slice(start, end)}\nreturn { submitTimeOff, decideTimeOff };`, { target: ts.ScriptTarget.ES2022 });
const deferred = () => {
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    return { promise, resolve };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup() {
    let token = 'A', busy = false, reason = 'short reason', items = [];
    const requestPromises = [], decisions = [], writes = [], events = [];
    const authSerial = { current: 0 }, timeOffLifecycle = { current: 1 }, timeOffActionSerial = { current: 0 };
    const window = new EventTarget();
    window.dispatchEvent = event => { events.push(event.type); return true; };
    const handlers = new Function(
        'selectedRow', 'canRequestTimeOff', 'myPendingTimeOffRequest', 'timeOffBusy', 'getToken', 'authSerial', 'authEpoch', 'session',
        'timeOffLifecycle', 'timeOffActionSerial', 'setTimeOffBusy', 'setTimeOffError', 'setTimeOffMessage', 'timeOffApi', 'timeOffReason',
        'setTimeOff', 'setTimeOffReason', 'window', 'Event', 't', 'viewer', 'load', handlersSource,
    )(
        { id: 10 }, true, undefined, busy, () => token, authSerial, 0, 'A', timeOffLifecycle, timeOffActionSerial,
        value => { busy = value; writes.push(['busy', value]); }, value => writes.push(['error', value]), value => writes.push(['message', value]),
        {
            submit: () => { const request = deferred(); requestPromises.push(request); return request.promise; },
            decide: () => { const request = deferred(); decisions.push(request); return request.promise; },
        }, reason,
        value => { items = typeof value === 'function' ? value(items) : value; writes.push(['items', items]); },
        value => { reason = value; writes.push(['reason', value]); }, window, Event, en => en, { role: 'staff' }, async () => {},
    );
    return {
        handlers, requestPromises, decisions, writes, events, authSerial, timeOffLifecycle,
        token: value => { token = value; },
        resetAccount: value => { token = value; authSerial.current++; reason = ''; busy = false; items = []; },
        unmount: () => { timeOffLifecycle.current++; timeOffActionSerial.current++; },
        get items() { return items; },
    };
}

test('old submit result is ignored after A→B→A account changes', async () => {
    const h = setup();
    const pending = h.handlers.submitTimeOff();
    h.resetAccount('B'); h.resetAccount('A');
    const before = h.writes.length;
    h.requestPromises[0].resolve({ id: 'old-A' });
    await pending;
    assert.equal(h.writes.length, before);
    assert.deepEqual(h.events, []);
});

test('logout clears the reason and rejects a late decision result', async () => {
    const h = setup();
    const pending = h.handlers.decideTimeOff({ id: 5, revision: 1, schedule_revision: 'r1' }, 'approve');
    h.resetAccount(null);
    const before = h.writes.length;
    h.decisions[0].resolve({ id: 5, status: 'approved' });
    await pending;
    assert.equal(h.writes.length, before);
    assert.deepEqual(h.events, []);
});

test('unmount retires in-flight submit and decision responses', async () => {
    const h = setup();
    const submit = h.handlers.submitTimeOff();
    h.unmount();
    const beforeSubmit = h.writes.length;
    h.requestPromises[0].resolve({ id: 'late-submit' });
    await submit;
    assert.equal(h.writes.length, beforeSubmit);

    // A new mounted generation can perform an action; its own unmount retires it.
    h.timeOffLifecycle.current++;
    const decide = h.handlers.decideTimeOff({ id: 6, revision: 1, schedule_revision: 'r2' }, 'decline');
    h.unmount();
    const beforeDecision = h.writes.length;
    h.decisions[0].resolve({ id: 6, status: 'declined' });
    await decide;
    assert.equal(h.writes.length, beforeDecision);
});

test('newer action response wins over an older out-of-order result', async () => {
    const h = setup();
    const first = h.handlers.submitTimeOff();
    const second = h.handlers.submitTimeOff();
    h.requestPromises[1].resolve({ id: 'newer' });
    await second;
    h.requestPromises[0].resolve({ id: 'older' });
    await first;
    assert.deepEqual(h.items.map(item => item.id), ['newer']);
});
