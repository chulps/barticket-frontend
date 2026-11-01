import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../'+path,import.meta.url),'utf8');
const income=read('src/pages/StaffIncome.tsx'), breakdown=read('src/pages/ChuckPayBreakdown.tsx');
test('pay hierarchy keeps methodology and charts open, uses one primary metric, and puts chart before ledger',()=>{
 assert.doesNotMatch(income, /const Details = styled.details/);
 assert.match(income, /<Metric \$primary>/);
 assert.ok(income.indexOf('<ChuckPayBreakdown report=')<income.indexOf('<OpenSection><h3>{ja ? "見積もりについて"'));
 assert.ok(breakdown.indexOf('<ChartColumn')<breakdown.indexOf('<LedgerDetails>'));
 assert.doesNotMatch(breakdown.match(/const Flow[^\n]+/)[0],/background:|border-radius:/);
 assert.match(income,/code !== "staff_drink_data_incomplete"/);
 assert.match(income,/Provisional after recorded costs—not final pay or a payment record/);
});
const luminance=hex=>{const channels=hex.match(/\w\w/g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
test('pay secondary copy uses readable existing neutral200 against neutral900 (366 subset)',()=>{
 const css=read('src/index.css');
 const token=name=>css.match(new RegExp('--'+name+': #(\\w{6})'))[1];
 const contrast=(luminance(token('neutral-200'))+.05)/(luminance(token('neutral-900'))+.05);
 assert.ok(contrast>=4.5,`authored contrast ${contrast}`);
 assert.doesNotMatch(income,/var\(--neutral-300\)/);
 assert.doesNotMatch(breakdown,/var\(--neutral-300\)/);
 assert.match(income,/small \{ font-size: calc\(var\(--font-size-p\) \* .875\)/);
});

test('guidance is consolidated into open methodology, while valid zero keeps an honest chart state',()=>{
 assert.match(breakdown,/export function ChuckPayMethodology/);
 assert.match(income,/<ChuckPayMethodology locale=\{locale\}/);
 assert.match(breakdown,/Full estimate \(not verified\)/);
 assert.match(breakdown,/The recorded gross share is zero/);
 assert.doesNotMatch(breakdown,/const Warning =/);
 assert.match(read('src/pages/ManagedShiftStats.tsx'),/selected.weekdays.some\(row => row.shift_count > 0\) \? <HorizontalBarRows/);
});
