import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/hooks/backgroundRefresh.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { startBackgroundRefresh } = await import('data:text/javascript,' + encodeURIComponent(compiled));
function setup({ healthy = false, hidden = false, task } = {}) {
    const win = new EventTarget();
    const doc = new EventTarget();
    doc.visibilityState = hidden ? 'hidden' : 'visible';
    win.navigator = { onLine: true };
    let reads = 0, next = 0;
    const timers = new Map(), intervals = new Map();
    win.setTimeout = fn => { timers.set(++next, fn); return next; };
    win.clearTimeout = id => timers.delete(id);
    win.setInterval = fn => { intervals.set(++next, fn); return next; };
    win.clearInterval = id => intervals.delete(id);
    const state = { healthy, day: '2026-10-31' };
    const stop = startBackgroundRefresh({ window: win, document: doc,
        shouldPoll: () => !state.healthy && doc.visibilityState !== 'hidden' && win.navigator.onLine,
        refresh: async () => { reads++; await task?.(); }, events: ['changed'], refreshKey: () => state.day,
    });
    const flush = async () => {
        const jobs = [...timers.values()]; timers.clear(); jobs.forEach(fn => fn());
        for (let i = 0; i < 8; i++) await Promise.resolve();
    };
    return { win, doc, state, stop, flush, reads: () => reads,
        emit: name => win.dispatchEvent(new Event(name)),
        poll: () => intervals.forEach(fn => fn()),
        timers, intervals };
}
test('healthy realtime skips timer reads; degraded and no-WebSocket fallback still refresh', async () => {
    const h = setup({ healthy: true }); await h.flush(); assert.equal(h.reads(), 1);
    h.poll(); await h.flush(); assert.equal(h.reads(), 1);
    h.state.healthy = false; h.poll(); await h.flush(); assert.equal(h.reads(), 2);
    h.poll(); await h.flush(); assert.equal(h.reads(), 3); h.stop();
});
test('hidden/offline tabs do not read; focus + visibility + reconnect coalesce on return', async () => {
    const h = setup({ hidden: true }); await h.flush(); h.poll(); h.emit('changed');
    await h.flush(); assert.equal(h.reads(), 0);
    h.doc.visibilityState = 'visible'; h.win.navigator.onLine = false;
    h.emit('focus'); await h.flush(); assert.equal(h.reads(), 0);
    h.win.navigator.onLine = true;
    h.doc.dispatchEvent(new Event('visibilitychange')); h.emit('focus'); h.emit('online'); h.emit('barticket-api-restored');
    await h.flush(); assert.equal(h.reads(), 1); h.stop();
});
test('events during a request are not lost and create exactly one trailing read', async () => {
    let resolve; const blocked = new Promise(r => { resolve = r; });
    const h = setup({ task: () => blocked }); await h.flush(); assert.equal(h.reads(), 1);
    h.emit('changed'); h.emit('changed'); h.poll(); await h.flush(); assert.equal(h.reads(), 1);
    resolve(); for (let i = 0; i < 8; i++) await Promise.resolve();
    await h.flush(); assert.equal(h.reads(), 2); h.stop();
});
test('cleanup cancels queued reads, timers, and listeners', async () => {
    const h = setup(); h.stop(); h.emit('focus'); h.poll(); await h.flush();
    assert.equal(h.reads(), 0); assert.equal(h.timers.size, 0); assert.equal(h.intervals.size, 0);
});
test('failed reads allow fallback recovery', async () => {
    let fail = true; const h = setup({ task: () => { if (fail) throw Error('offline'); } });
    await h.flush(); fail = false; h.poll(); await h.flush(); assert.equal(h.reads(), 2); h.stop();
});
test('hide during debounce prevents request, return catches up', async () => {
    const h = setup(); h.doc.visibilityState = 'hidden'; await h.flush(); assert.equal(h.reads(), 0);
    h.doc.visibilityState = 'visible'; h.doc.dispatchEvent(new Event('visibilitychange'));
    await h.flush(); assert.equal(h.reads(), 1); h.stop();
});

test('healthy realtime still refreshes once when business date rolls over', async () => {
    const h = setup({ healthy: true }); await h.flush();
    h.state.day = '2026-11-01'; h.poll(); await h.flush(); assert.equal(h.reads(), 2);
    h.poll(); await h.flush(); assert.equal(h.reads(), 2); h.stop();
});
