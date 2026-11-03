import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/pages/Schedules.tsx', import.meta.url), 'utf8');
const calendar = readFileSync(new URL('../src/pages/scheduleCalendar.ts', import.meta.url), 'utf8');
const compile = code => ts.transpile(code, { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 });
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function fixture(context = null) {
    const module = { exports: {} }; new Function('module', 'exports', compile(calendar))(module, module.exports);
    const handlers = between('const navigate =', 'const moveDateFocus =');
    const readRange = source.match(/^\s*const \{ from, to \} =.*;$/m)?.[0];
    assert.ok(readRange, 'Schedule range declaration must be available');
    const contextHandler = between('const requestContext =', 'const refresh =');
    let finish;
    const request = new Promise(resolve => { finish = resolve; });
    const body = `
        let mode = 'month', selected = '2026-11-02', month = '2026-11';
        let scheduleContext = initialContext, detail = true, editing = true, creating = true;
        const pendingDayDefault = { current: null }, authSerial = { current: 0 };
        const contextSerial = { current: 0 }, contextFlight = { current: null }, contextEffectActive = { current: true };
        const authEpoch = 0, session = 'A', getToken = () => 'A';
        const document = { hidden: false }, navigator = { onLine: true };
        const setScheduleContext = value => { scheduleContext = value; };
        const setMonth = value => { month = value; }, setSelected = value => { selected = value; }, setMode = value => { mode = value; };
        const setDetail = value => { detail = value; }, setEditing = value => { editing = value; }, setCreating = value => { creating = value; };
        const scheduledShiftsApi = { context: () => request };
        ${contextHandler}
        return {
            change(next) { const today = scheduleContext?.operational_business_date ?? '2026-11-02'; ${handlers} changeView(next); },
            navigate(amount) { const today = '2026-11-02'; ${handlers} navigate(amount); },
            range() { ${readRange} return { from, to }; },
            state: () => ({ mode, selected, month, detail, editing, creating }),
            requestContext, retireAuth: () => { authSerial.current++; contextSerial.current++; contextFlight.current = null; },
        };`;
    const f = new Function('initialContext', 'request', 'addDays', 'changeMonth', 'weekRange', 'monthRange', compile(body))(context, request, ...['addDays','changeMonth','weekRange','monthRange'].map(key => module.exports[key]));
    return { ...f, finish: async value => { finish(value); await request; await Promise.resolve(); await Promise.resolve(); } };
}
const context = (operational = '2026-11-05') => ({ operational_business_date: operational, calendar_business_date: '2026-11-02' });
test('Day is a genuine selected single-date view and defaults to operational, not calendar today', () => {
    const f = fixture(context()); f.change('day');
    assert.deepEqual(f.state(), { mode: 'day', selected: '2026-11-05', month: '2026-11', detail: false, editing: false, creating: false });
    assert.deepEqual(f.range(), { from: '2026-11-05', to: '2026-11-05' });
    f.navigate(1); assert.equal(f.state().selected, '2026-11-06');
    f.change('week'); assert.deepEqual(f.range(), { from: '2026-11-01', to: '2026-11-07' });
    f.change('month'); assert.deepEqual(f.range(), { from: '2026-11-01', to: '2026-11-30' });
    f.change('day'); assert.equal(f.state().selected, '2026-11-05');
});
test('Day navigation crosses month, year, leap-day and DST dates by exactly one day', () => {
    for (const [from, to] of [['2026-11-30','2026-12-01'],['2026-12-31','2027-01-01'],['2028-02-28','2028-02-29'],['2028-02-29','2028-03-01'],['2027-03-14','2027-03-15']]) {
        const f = fixture(context(from)); f.change('day'); f.navigate(1);
        assert.deepEqual(f.range(), { from: to, to }); assert.equal(f.state().month, to.slice(0,7));
        f.navigate(-1); assert.deepEqual(f.range(), { from, to: from });
    }
});
test('Day selected before context arrives settles once on authoritative operational date', async () => {
    const f = fixture(); f.change('day'); f.requestContext();
    assert.equal(f.state().selected, '2026-11-02');
    await f.finish(context()); assert.equal(f.state().selected, '2026-11-05');
    f.navigate(1); f.requestContext(); await Promise.resolve(); await Promise.resolve();
    assert.equal(f.state().selected, '2026-11-06');
});
test('late context cannot undo manual Day navigation, view switching or newer auth', async () => {
    for (const operation of ['navigate', 'switch', 'auth']) {
        const f = fixture(); f.change('day'); f.requestContext();
        if (operation === 'navigate') f.navigate(1);
        else if (operation === 'switch') f.change('week');
        else f.retireAuth();
        await f.finish(context());
        assert.equal(f.state().selected, operation === 'navigate' ? '2026-11-03' : '2026-11-02');
    }
});
test('Day uses one date-only row, existing truthful colors, details and guarded editor', () => {
    assert.match(source, /const visibleDays = mode === "day" \? \[selected\] : weekDays\(selected\)/);
    assert.match(source, /visibleDays\.map\(day/);
    assert.match(source, /row \? <WeekEvent \$state=\{cellState\(row\)\}/);
    assert.match(source, /<EmptyDay type="button"/);
    assert.match(source, /Date-only plans · hours not recorded/);
    assert.match(source, /viewer\?\.role === "manager" && scheduleContext && !selectedIsPast/);
    assert.doesNotMatch(source, /trailingAction=/);
});
