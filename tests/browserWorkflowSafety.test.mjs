import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('manual continuity output stays separate from mocked browser evidence', () => {
  const deployment = readFileSync(new URL('../playwright.deployment.config.mjs', import.meta.url), 'utf8');
  const mocked = readFileSync(new URL('../playwright.config.mjs', import.meta.url), 'utf8');
  assert.match(deployment, /outputDir: '\.\/deployment-test-results'/);
  assert.doesNotMatch(mocked, /outputDir:/); // Existing Playwright default: test-results.
});
