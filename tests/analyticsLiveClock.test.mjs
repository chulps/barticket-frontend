import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/pages/analyticsLiveClock.ts', import.meta.url), 'utf8'), { compilerOptions: {module: ts.ModuleKind.ESNext} }).outputText;
const {withLiveShiftHours} = await import('data:text/javascript,' + encodeURIComponent(code));
test('open hours advance from effective punches without database refresh or snapshot mutation', () => {
    const shift = {status:'open',staff_hours:[{user_id:1,seconds:50},{user_id:2,seconds:20}],punches:[
        {user_id:1,clock_in:100,clock_out:120}, {user_id:1,clock_in:150,clock_out:null},
        {user_id:2,clock_in:90,clock_out:110},
    ]};
    assert.deepEqual(withLiveShiftHours(shift, 200).staff_hours.map(p=>p.seconds), [70,20]);
    assert.deepEqual(withLiveShiftHours(shift, 230).staff_hours.map(p=>p.seconds), [100,20]);
    assert.equal(shift.staff_hours[0].seconds,50);
    assert.equal(withLiveShiftHours({...shift,status:'closed'},230).staff_hours[0].seconds,50);
    assert.equal(withLiveShiftHours(shift,null),shift);
});
test('live occupancy uses the local clock ahead of the last fetch timestamp', () => {
    const s=readFileSync(new URL('../src/pages/Analytics.tsx',import.meta.url),'utf8');
    assert.match(s,/now=\{clockNow \?\? lastUpdated/);
});
