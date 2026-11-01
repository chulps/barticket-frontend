import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/browser-regression.yml', import.meta.url), 'utf8');

// These workflow expressions deliberately use only property access, || and ==,
// whose semantics match JavaScript for the strings/numeric IDs exercised here.
function evaluate(template, github) {
  return template.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression) =>
    String(vm.runInNewContext(expression, { github })));
}

test('browser concurrency cancels only superseded revisions of the same PR', () => {
  const group = workflow.match(/^  group: (.+)$/m)?.[1];
  const cancel = workflow.match(/^  cancel-in-progress: (.+)$/m)?.[1];
  assert.equal(group, '${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}');
  assert.equal(cancel, "${{ github.event_name == 'pull_request' }}");
  const event = (number, run_id, event_name = 'pull_request', name = 'Mocked browser POS regression') => ({
    workflow: name, event_name, run_id, event: { pull_request: number ? { number } : {} },
  });
  const original = event(359, 100);
  assert.equal(evaluate(group, original), evaluate(group, event(359, 101)));
  assert.equal(evaluate(cancel, original), 'true');
  for (const unrelated of [event(358, 101), event(359, 101, 'pull_request', 'Frontend checks'), event(null, 100, 'workflow_dispatch')]) {
    assert.notEqual(evaluate(group, original), evaluate(group, unrelated));
  }
  const manualA = event(null, 100, 'workflow_dispatch');
  const manualB = event(null, 101, 'workflow_dispatch');
  assert.notEqual(evaluate(group, manualA), evaluate(group, manualB));
  assert.equal(evaluate(cancel, manualA), 'false');
});

test('continuity output is separate and retained alongside original browser evidence', () => {
  const deployment = readFileSync(new URL('../playwright.deployment.config.mjs', import.meta.url), 'utf8');
  const mocked = readFileSync(new URL('../playwright.config.mjs', import.meta.url), 'utf8');
  assert.match(deployment, /outputDir: '\.\/deployment-test-results'/);
  assert.doesNotMatch(mocked, /outputDir:/); // Existing Playwright default: test-results.
  assert.match(workflow, /name: browser-regression-results[\s\S]*?playwright-report\/[\s\S]*?test-results\/[\s\S]*?deployment-test-results\//);
  assert.equal((workflow.match(/retention-days: 5/g) || []).length, 5);
  assert.match(workflow, /run: npx playwright test --config=playwright.config.mjs\n/);
  assert.match(workflow, /run: npx playwright test --config=playwright.deployment.config.mjs\n/);
  assert.doesNotMatch(workflow, /--grep|--shard|--workers|continue-on-error/);
});
