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
