# Isolated browser regression tests — #141

This optional suite uses Playwright Chromium against the **local Vite dev server only**.
The API URL is set to `http://127.0.0.1:8765`, where **all requests are intercepted and fulfilled in memory**. Browser tests reject network requests to other hosts. Never supply a live API URL or bar credentials.

Run manually when wanted:

```sh
npm ci
npm install --no-save --package-lock=false @playwright/test@1.56.1
npx playwright install chromium
npx playwright test --config=playwright.config.mjs
```

The `Mocked browser POS regression` GitHub Actions workflow has been removed at the user's request. These browser tests no longer run automatically on pull requests or through that workflow's manual dispatch. Browser test files and configurations remain available for optional local runs. Real-device visual and interaction review is manual.

Auth tokens and users are fake; they are not production secrets. No production tickets, shifts, payments, or payroll records can be modified. Coverage includes auth failure, double-create, close confirmation/back/cancel, payment error/success/reopen, and phone-width Japanese search/ticket controls. Passing mocked tests does not replace real iOS/Android QA.

## Optional deployment-continuity checks

After the setup commands above, run the retained continuity suite separately:

```sh
node scripts/build-deployment-fixtures.mjs
npx playwright test --config=playwright.deployment.config.mjs
```

The removed workflow previously ran these checks too; they are now manual. Its removal does not change the Pages deployment workflow or the asset-retention protections exercised by unit tests.

Mocked browser output stays in `test-results/` and deployment-continuity output uses `deployment-test-results/`, so continuity startup cleanup cannot erase mocked-suite failure traces or screenshots. Traces are retained on failure and failure screenshots follow the configurations. There is no automatic artifact upload or five-day artifact retention from the removed workflow. Inspect local outputs after a manual run.

The separate Frontend checks workflow continues to run its unit, security, and production-build checks. No branch protection settings are changed by this workflow removal; an administrator must review any required check referring to the removed workflow rather than bypassing it.
