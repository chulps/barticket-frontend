import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/TabGroup.tsx',import.meta.url),'utf8');
test('shared tabs use equal available-width columns, not label-weighted flex widths',()=>{
  assert.match(source,/grid-auto-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(source,/flex: 1 0 max-content/);
});
test('indicator has one origin and restores bounce inside a decorative-only clip',()=>{
  assert.match(source,/rect.left - containerRect.left/);
  assert.match(source,/left: 0;/);
  assert.match(source,/transition: transform 300ms cubic-bezier\(0.34, 1.56, 0.64, 1\)/);
  assert.match(source,/clip-path: inset\(var\(--space-0\) round/);
  assert.match(source,/<IndicatorClip aria-hidden="true"/);
  assert.match(source,/indicator.width > 0/);
  assert.match(source,/buttons.current.forEach/);
});

test('Profile uses shared responsive geometry, without hiding the indicator',()=>{
  const profile=readFileSync(new URL('../src/pages/Profile.tsx',import.meta.url),'utf8');
  assert.match(profile,/mobileColumns=\{2\}/);
  assert.doesNotMatch(profile,/> \[role="group"\] > div > div/);
  assert.match(source,/rect.top - containerRect.top/);
});
