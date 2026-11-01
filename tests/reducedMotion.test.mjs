import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
test('global reduced motion removes scrolling and shared control scaling without stripping focus feedback', () => {
  const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /scroll-behavior: auto !important/);
  assert.match(reduced, /transition-duration: 0s !important/);
  assert.match(reduced, /animation-iteration-count: 1 !important/);
  assert.match(reduced, /button:hover,[\s\S]*input:focus\s*\{\s*transform: none;/);
  assert.doesNotMatch(reduced, /outline:|color:|background:|opacity:|display:|visibility:/);
  // Don't blanket-remove geometry used to center or position controls.
  assert.doesNotMatch(reduced, /transform: none !important/);
});
