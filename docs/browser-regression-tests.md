# Isolated browser regression tests — #141

This suite uses Playwright Chromium against the **local Vite dev server only**.
The API URL is set to \`http://127.0.0.1:8765\`, where **all requests are intercepted and fulfilled in memory**. Browser tests reject network requests to other hosts. Never supply a live API URL or bar credentials.

Run locally:

\`\`\`sh
npm ci
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
npx playwright test --config=playwright.config.mjs
\`\`\`

In CI, the dedicated \`Mocked browser POS regression\` workflow runs on PRs. Traces/screenshots are retained **on failure only**, with short artifact retention. Auth tokens and users are fake; they are not production secrets. No production tickets, shifts, payments, or payroll records can be modified.

Coverage started with auth failure, double-create, close confirmation/back/cancel, payment error/success/reopen, and phone-width Japanese search/ticket controls. Expand this suite to cover partial add-item failure, price save/cancel, modal focus/keyboard and multi-device/viewport matrix; do not interpret a green CI run as real iOS/Android QA.

## CI scheduling and evidence

A new revision cancels an older run of this workflow for the same pull request.
Other PRs and manually dispatched runs are independent. The latest revision still
runs the complete mocked browser suite and all deployment-continuity tests; this
avoids obsolete work, not the runtime of a single full gate.

Mocked browser output stays in `test-results/` and `playwright-report/`.
Deployment-continuity output uses `deployment-test-results/`, so its startup cleanup
cannot erase mocked-suite failure traces or screenshots. The final
`browser-regression-results` artifact includes all three directories. Existing
dedicated visual artifacts and five-day retention remain unchanged.

Five recent runs before this change took 8m31s–12m51s, with 84–86% spent running
browser tests. No per-run speedup is claimed: sharding and browser caching are not
part of this change. Validate any future shard pilot against the full collected
test-ID set, preserve required gate semantics and artifacts, and compare controlled
same-commit runs including runner-minute cost before adopting it.
