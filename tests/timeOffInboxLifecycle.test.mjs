import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/pages/Notifications.tsx', import.meta.url), 'utf8');
const start = source.indexOf('    useEffect(() => {\n        let active = true;\n        let authEpoch = 0;');
const end = source.indexOf('\n\n    const openTimeOff', start);
assert.ok(start >= 0 && end > start);
const effect = ts.transpile(source.slice(start, end), { target: ts.ScriptTarget.ES2022 });
const deferred = () => {
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    return { promise, resolve };
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup() {
    let token = 'A', cleanup, interval;
    const pending = [], writes = [];
    const window = new EventTarget();
    window.setInterval = callback => { interval = callback; return 1; };
    window.clearInterval = () => { interval = undefined; };
    const context = {
        useEffect: callback => { cleanup = callback(); },
        shouldPoll: () => true,
        timeOffApi: { inbox: () => { const request = deferred(); pending.push(request); return request.promise; } },
        window,
        getToken: () => token,
        setTimeOffItems: value => writes.push(value),
    };
    vm.createContext(context);
    vm.runInContext(`${effect}\nglobalThis.startEffect = useEffect;`, context);
    return {
        pending,
        writes,
        auth(next) { token = next; window.dispatchEvent(new Event('barticket-auth')); },
        poll() { interval?.(); },
        unmount() { cleanup?.(); },
    };
}

test('old inbox responses cannot cross A→B→A account epochs', async () => {
    const h = setup();
    h.auth('B');
    h.auth('A');
    h.pending[0].resolve([{ id: 'old-A' }]);
    h.pending[1].resolve([{ id: 'old-B' }]);
    await flush();
    assert.equal(h.writes.some(value => Array.isArray(value) && value.some(item => item.id === 'old-A' || item.id === 'old-B')), false);
    h.pending[2].resolve([{ id: 'current-A' }]);
    await flush();
    assert.deepEqual(JSON.parse(JSON.stringify(h.writes.at(-1))), [{ id: 'current-A' }]);
});

test('logout clears inbox and prevents a late response from restoring it', async () => {
    const h = setup();
    h.auth(null);
    assert.deepEqual(JSON.parse(JSON.stringify(h.writes.at(-1))), []);
    h.pending[0].resolve([{ id: 'private-before-logout' }]);
    await flush();
    assert.equal(h.writes.some(value => Array.isArray(value) && value.some(item => item.id === 'private-before-logout')), false);
    assert.equal(h.pending.length, 1);
});

test('newer inbox refresh wins when same-account responses arrive out of order', async () => {
    const h = setup();
    h.poll();
    h.pending[1].resolve([{ id: 'newer' }]);
    await flush();
    h.pending[0].resolve([{ id: 'older' }]);
    await flush();
    assert.deepEqual(JSON.parse(JSON.stringify(h.writes.at(-1))), [{ id: 'newer' }]);
    assert.equal(h.writes.some(value => Array.isArray(value) && value.some(item => item.id === 'older')), false);
});

test('unmount retires in-flight inbox responses', async () => {
    const h = setup();
    const writesBeforeUnmount = h.writes.length;
    h.unmount();
    h.pending[0].resolve([{ id: 'late-after-unmount' }]);
    await flush();
    assert.equal(h.writes.length, writesBeforeUnmount);
});
