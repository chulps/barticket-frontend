import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync } from 'node:fs'; import ts from 'typescript';
function load(file){const m={exports:{}};new Function('module','exports',ts.transpile(readFileSync(new URL('../src/pages/'+file,import.meta.url),'utf8'),{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}))(m,m.exports);return m.exports;}
const {addDays,calendarDays,monthRange,changeMonth,weekRange,weekDays}=load('scheduleCalendar.ts');
test('calendar date-only leap and year boundaries',()=>{assert.deepEqual(monthRange('2028-02'),{from:'2028-02-01',to:'2028-02-29'});assert.equal(changeMonth('2026-12',1),'2027-01');assert.equal(calendarDays('2026-11')[0],'2026-11-01');assert.equal(calendarDays('2026-11').length,35);});
const {createScheduleReadStore}=load('scheduleReadStore.ts');
test('schedule reads dedupe, cache only same account/range and expire',async()=>{let reads=0,now=0;const store=createScheduleReadStore(async()=>++reads,()=>now);assert.deepEqual(await Promise.all([store.load('a','1','2'),store.load('a','1','2')]),[1,1]);assert.equal(await store.load('a','1','2'),1);assert.equal(await store.load('b','1','2'),2);now=60001;assert.equal(await store.load('b','1','2'),3);});
test('mutation invalidation retires pending pre-write cached value',async()=>{let finish;let reads=0;const store=createScheduleReadStore(()=>++reads===1?new Promise(r=>finish=r):Promise.resolve('new'));const old=store.load('a','1','2');store.invalidate();assert.equal(await store.load('a','1','2'),'new');finish('old');await old;assert.equal(await store.load('a','1','2'),'new');});
test('calendar and editor use readable typography independent of nine-pixel app root',()=>{
 for(const file of ['Schedules.tsx','ScheduleEditor.tsx']){const source=readFileSync(new URL('../src/pages/'+file,import.meta.url),'utf8');assert.doesNotMatch(source,/font-size:\s*[.\d]+rem/);for(const match of source.matchAll(/font-size:\s*([.\d]+)px/g))assert.ok(Number(match[1])>=12);assert.doesNotMatch(source,/--primary-(300|500)|--neutral-50\)/);}
});

test('weeks include exactly seven Sunday–Saturday dates across month, year, leap and DST boundaries', () => {
 for (const [day, from, to] of [
  ['2026-11-02', '2026-11-01', '2026-11-07'],
  ['2026-11-01', '2026-11-01', '2026-11-07'],
  ['2026-11-07', '2026-11-01', '2026-11-07'],
  ['2026-11-30', '2026-11-29', '2026-12-05'],
  ['2027-01-01', '2026-12-27', '2027-01-02'],
  ['2028-02-29', '2028-02-27', '2028-03-04'],
  ['2027-03-14', '2027-03-14', '2027-03-20'],
 ]) {
  assert.deepEqual(weekRange(day), { from, to });
  assert.deepEqual(weekDays(day), Array.from({ length: 7 }, (_, index) => addDays(from, index)));
  assert.equal(weekDays(day)[6], to);
  assert.equal(weekRange(addDays(day, 7)).from, addDays(from, 7));
  assert.equal(weekRange(addDays(day, -7)).to, addDays(to, -7));
 }
});
test('week and month caches are independently range-scoped and retain auth isolation', async () => {
 const reads = [];
 const store = createScheduleReadStore(async (from, to) => { reads.push([from, to]); return `${from}:${to}`; });
 const month = monthRange('2026-11'), week = weekRange('2026-11-30');
 await store.load('a', month.from, month.to);
 await store.load('a', week.from, week.to);
 await store.load('a', week.from, week.to);
 assert.deepEqual(reads, [[month.from, month.to], [week.from, week.to]]);
 await store.load('b', week.from, week.to);
 assert.equal(reads.length, 3);
});
