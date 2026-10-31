# Admin/Profile loading review — 2026-10-31

## Changes

- Share pending `/auth/me` requests and reuse a successful response for at most one second during App → route mounting. The cache is memory-only and keyed to the exact session token.
- Auth events, focus revalidation, and profile updates invalidate it. Invalidation retires pending responses; old completions cannot refill the cache or supersede a newer account.
- Header starts account and current-shift reads together.
- A stored session gets the normal navigation shell during verification. Private route data remains gated. Header clears the previous role/name as soon as the session changes.
- Admin keeps the selected screen and verified same-session records while focus revalidation runs, with an updating indicator. Transient failures show an error without discarding the screen. A changed account, revoked role, or 401/403 clears private records.
- API reconnection revalidates without unmounting private routes. Authentication changes still unmount them immediately.

## Isolated measurements

No production records were changed. Browser fixtures block non-loopback traffic and delay `/auth/me`, `/users`, and `/shifts/current` by 300 ms each.

Baseline: main at `cee6744`, development StrictMode, three fixture runs:
- 6 `/auth/me` requests per cold Admin entry.
- First auth request → `/users`: 980, 1003, 1026 ms.
- First auth request → current-shift request: 319, 321, 338 ms.
- Admin ready: 1979, 1947, 1951 ms.

Changed code, recorded isolated run:
- 1 `/auth/me` request per cold Admin entry.
- First auth request → `/users`: 644 ms.
- First auth request → current-shift request: 1 ms.
- Admin ready: 1076 ms.
- Warm Admin → Profile → Admin: 1072 ms total, 1 additional auth read; Profile transition 510 ms.

These are synthetic development measurements, not production latency claims. Lazy-module compilation and host load contribute to wall time. Regression checks assert request count, read-only navigation, stable revalidation, and session isolation without a brittle overall timing budget.

## Remaining work

Production cold-start and API-region latency have not been measured. Profile earnings/history and team payroll endpoints retain their existing fetching behavior. This addresses repeated account checks and shell/refresh flicker, not every contributor to issue #267.
