import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pages/Schedules.tsx', import.meta.url), 'utf8');
test('Schedule shares the existing TabGroup while filling the available row with equal columns', () => {
    assert.match(source, /import TabGroup from "\.\.\/components\/TabGroup"/);
    assert.match(source, /const ScheduleControls = styled\.div`align-self:stretch;flex:0 0 100%;min-width:0;max-width:100%;width:100%;`/);
    assert.doesNotMatch(source.match(/<TabGroup[\s\S]*?\/>/)[0], /fitLabels|unframed|trailingAction/);
    for (const id of ['month', 'week', 'day']) assert.ok(source.includes(`id: "${id}" as const`));
});
