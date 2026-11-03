import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const component = readFileSync(new URL('../src/components/TemporarySmtpTest.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/pages/Admin.tsx', import.meta.url), 'utf8');
test('one fixed manual POST through the existing authenticated helper with no retry', () => {
  assert.match(component, /apiRequest<Outcome>\("\/internal\/one-off-smtp-test", \{ method: "POST" \}\)/);
  assert.match(component, /if \(attempted\.current\) return/);
  assert.match(component, /attempted\.current = true/);
  assert.doesNotMatch(component, /setTimeout|setInterval|localStorage|Authorization|fetch\(/);
  assert.match(component, /do not resend/);
});
test('temporary control appears only inside manager-gated admin with explicit query', () => {
  const guard = admin.indexOf('if (me?.role !== "manager")');
  const control = admin.indexOf('sectionParams.get("smtp-test") === "1" ? <TemporarySmtpTest');
  assert.ok(guard >= 0 && control > guard);
});
