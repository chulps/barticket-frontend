import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/Schedules.tsx', import.meta.url), 'utf8');
// Execute the real event handler, not a parallel implementation.
const start = source.indexOf('const reset = (event: Event) =>');
const end = source.indexOf('window.addEventListener("barticket-auth", reset)', start);
assert.ok(start >= 0 && end > start);
const handler = ts.transpile(source.slice(start, end) + '\nreturn reset;', { target: ts.ScriptTarget.ES2022 });
class StorageEvent { constructor(key) { this.key = key; } }
function fixture() {
    let token = 'A';
    let state = { token: 'A', epoch: 0 };
    const queue = [], resets = [], clears = [];
    const serial = { current: 0 };
    const authSerial = { current: 0 };
    const contextSerial = { current: 0 }, contextFlight = { current: { session: 'A', serial: 0, rerun: false } };
    const timeOffActionSerial = { current: 4 };
    const pendingDayDefault = { current: 1 };
    const reset = new Function('StorageEvent', 'getToken', 'serial', 'authSerial', 'contextSerial', 'contextFlight', 'store', 'setAuthState', 'setRows', 'setKnownManagers', 'setReservations', 'setAssignedReservations', 'setUnassignedReservations', 'setReservationBusy', 'setReservationError', 'setReservationMessage', 'handledReservationLink', 'setViewer', 'setScheduleContext', 'setEditing', 'setDetail', 'setTimeOff', 'setTimeOffReason', 'setTimeOffBusy', 'setTimeOffError', 'setTimeOffMessage', 'timeOffActionSerial', 'handledDeepLink', 'pendingDayDefault', handler)(StorageEvent, () => token, serial, authSerial, contextSerial, contextFlight, { reset: next => resets.push(next) }, update => queue.push(update), value => clears.push(['rows', value]), value => clears.push(['names', value]), value => clears.push(['reservations', value]), value => clears.push(['assignedReservations', value]), value => clears.push(['unassignedReservations', value]), value => clears.push(['reservationBusy', value]), value => clears.push(['reservationError', value]), value => clears.push(['reservationMessage', value]), { current: 'A:2' }, value => clears.push(['viewer', value]), value => clears.push(['context', value]), value => clears.push(['editing', value]), value => clears.push(['detail', value]), value => clears.push(['timeOff', value]), value => clears.push(['timeOffReason', value]), value => clears.push(['timeOffBusy', value]), value => clears.push(['timeOffError', value]), value => clears.push(['timeOffMessage', value]), timeOffActionSerial, { current: 'A:1' }, pendingDayDefault);
    return { reset, serial, authSerial, contextSerial, contextFlight, timeOffActionSerial, pendingDayDefault, resets, clears, token: next => { token = next; }, flush: () => { for (const update of queue.splice(0)) state = update(state); return state; } };
}
test('batched A→B→A auth captures latest token and retires every epoch', () => {
    const f = fixture(); f.token('B'); f.reset({}); f.token('A'); f.reset({});
    assert.deepEqual(f.flush(), { token: 'A', epoch: 2 });
    assert.deepEqual(f.resets, ['B', 'A']); assert.equal(f.serial.current, 2); assert.equal(f.authSerial.current, 2);
    assert.equal(f.contextSerial.current, 2); assert.equal(f.contextFlight.current, null);
    assert.equal(f.timeOffActionSerial.current, 6);
    assert.equal(f.pendingDayDefault.current, null);
    assert.equal(f.clears.filter(([field]) => field === 'rows').length, 2);
    assert.equal(f.clears.filter(([field]) => field === 'context').length, 2);
    for (const field of ['reservations', 'assignedReservations', 'unassignedReservations']) assert.deepEqual(f.clears.filter(([name]) => name === field), [[field, []], [field, []]]);
    assert.deepEqual(f.clears.filter(([field]) => field === 'reservationBusy'), [['reservationBusy', false], ['reservationBusy', false]]);
    for (const field of ['reservationError', 'reservationMessage']) assert.deepEqual(f.clears.filter(([name]) => name === field), [[field, ''], [field, '']]);
    assert.deepEqual(f.clears.filter(([field]) => field === 'timeOffReason'), [['timeOffReason', ''], ['timeOffReason', '']]);
    assert.deepEqual(f.clears.filter(([field]) => field === 'timeOffBusy'), [['timeOffBusy', false], ['timeOffBusy', false]]);
});
test('same-token authorization refresh retires cached reads and reloads viewer and visible range', () => {
    const f = fixture(); f.reset({});
    assert.deepEqual(f.flush(), { token: 'A', epoch: 1 });
    assert.deepEqual(f.resets, ['A']); assert.equal(f.serial.current, 1);
    assert.equal(f.contextSerial.current, 1); assert.equal(f.contextFlight.current, null);
    assert.equal(f.timeOffActionSerial.current, 5);
    assert.equal(f.pendingDayDefault.current, null);
    assert.match(source, /\[from, to, session, authEpoch\]/);
    assert.match(source, /authEpoch !== authSerial.current \|\| !session/);
    assert.match(source, /requestAuth === authSerial.current && session === getToken\(\)/);
    assert.match(source, /accountApi\.me\(\)[\s\S]*?\[session, authEpoch\]/);
});
test('unrelated storage ignored; clear/logout captured even before render', () => {
    const f = fixture(); f.reset(new StorageEvent('barticket_locale'));
    assert.equal(f.resets.length, 0); assert.equal(f.serial.current, 0);
    f.token(null); f.reset(new StorageEvent(null));
    assert.deepEqual(f.flush(), { token: null, epoch: 1 });
    assert.deepEqual(f.resets, [null]);
    assert.deepEqual(f.clears.find(([field]) => field === 'viewer'), ['viewer', null]);
    assert.deepEqual(f.clears.find(([field]) => field === 'context'), ['context', null]);
});
test('old me success and failure cannot restore viewer after same-token auth epoch', async () => {
    const begin = source.indexOf('let active = true;');
    const end = source.indexOf('}, [session, authEpoch]);', begin);
    assert.ok(begin >= 0 && end > begin);
    const body = ts.transpile(source.slice(begin, end), { target: ts.ScriptTarget.ES2022 });
    for (const fail of [false, true]) {
        let resolve, reject;
        const request = new Promise((a, b) => { resolve = a; reject = b; });
        const authSerial = { current: 0 }, viewers = [];
        const cleanup = new Function('accountApi', 'authSerial', 'session', 'getToken', 'setViewer', body)({ me: () => request }, authSerial, 'A', () => 'A', value => viewers.push(value));
        // Same-token event arrives before React cleanup; token comparison alone is insufficient.
        authSerial.current++;
        if (fail) reject(new Error('old request')); else resolve({ id: 1, role: 'manager' });
        await request.catch(() => {}); await Promise.resolve();
        assert.deepEqual(viewers, []);
        cleanup();
    }
});
