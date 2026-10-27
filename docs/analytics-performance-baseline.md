# Analytics refresh and render baseline

The mocked Playwright profile uses a deterministic fixture of 100 closed shifts
and 1,000 paid tickets. All API traffic stays inside the browser's loopback
route mocks; no live account or production data is used.

Run it with:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/barticket-playwright-browsers \
  npx playwright test --config=playwright.config.mjs \
  -g '100-shift, 1000-ticket fixture'
```

On the local macOS Chromium run on 2026-10-27, navigation to Analytics took
1,178 ms and switching to All Time rendered the ticket/summary panels in 812 ms.
The browser test keeps a generous 10-second ceiling for both operations as a
regression guard. The values printed by the test provide a repeatable profile
for future changes; they are not a cross-machine performance promise.
