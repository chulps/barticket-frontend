import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = path => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
test('ticket board takes shell remainder rather than independent guessed viewport offsets', () => {
  const dashboard = source('pages/Dashboard.tsx'), sidebar = source('components/TicketSidebar.tsx');
  assert.match(dashboard, /<DashboardContainer data-ticket-dashboard>/);
  assert.match(dashboard, /<TicketBoard>/);
  assert.doesNotMatch(dashboard + sidebar, /calc\(100vh -/);
  assert.match(dashboard, /height: 100vh;\s*height: 100dvh;/);
  assert.match(sidebar, /min-height: 0;\s*overflow-y: auto;/);
});
test('viewport shell is scoped to tickets and has dynamic viewport fallback', () => {
  const css = source('index.css');
  assert.match(css, /body:has\(\[data-ticket-dashboard\]\)\s*\{\s*height: 100vh;\s*height: 100dvh;/);
  assert.match(css, /#root:has\(\[data-ticket-dashboard\]\)\s*\{[^}]*min-height: 0;/);
  assert.match(css, /safe-area-inset-bottom/);
});
test('only ticket status opts into unbroken content-sized labels; bounce clip remains', () => {
  const tabs = source('components/TabGroup.tsx');
  assert.match(source('components/TicketSidebar.tsx'), /<TabGroup\s+fitLabels/);
  assert.match(tabs, /\$fitLabels.*\? `/);
  assert.match(tabs, /width: max-content;/);
  assert.match(tabs, /min-width: max-content; white-space: nowrap;/);
  assert.match(tabs, /clip-path: inset/);
  assert.match(tabs, /cubic-bezier\(0.34, 1.56, 0.64, 1\)/);
});
