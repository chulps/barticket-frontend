import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/components/TabGroup.tsx',import.meta.url),'utf8');
test('shared tabs use equal intrinsic-safe columns, not label-weighted flex widths',()=>{
  assert.match(source,/grid-auto-columns: minmax\(max-content, 1fr\)/);
  assert.doesNotMatch(source,/flex: 1 0 max-content/);
});
test('indicator has one origin and cannot spring beyond its target',()=>{
  assert.match(source,/rect.left - container.getBoundingClientRect\(\).left/);
  assert.match(source,/left: 0;/);
  assert.match(source,/transition: transform 300ms ease/);
  assert.match(source,/indicator.width > 0/);
  assert.match(source,/buttons.current.forEach/);
});
