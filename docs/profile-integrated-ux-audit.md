# Profile integrated UX and role review — 2026-10-31

Reviewed main `49c06c1` with the Profile section-link change from PR #294. This is fixture evidence for frontend #266/#228 and API #74, not proof of production authorization or payroll correctness.

## Matrix and results

`tests/browser/profile-integrated-audit.spec.mjs` runs Staff (7), Chuck (901), and Nori (902), each in English/Japanese at 320px and 1280px: **12 scenarios passed**. Every scenario visits My pay, Work history, Shift and Account settings, yielding 48 screenshots. Japanese rendering used Noto Sans CJK JP installed in the QA container. Representative screenshots of each role and destination were inspected; there was no clipping, horizontal overflow, or inaccessible destination in these fixtures.

| Area | Verified outcome |
|---|---|
| Navigation | My pay default; four peer destinations; section URLs follow selection; separate PR #294 EN/JP tests cover Dashboard time-clock jump and browser Back/Forward. |
| Staff pay | Only self earnings endpoint; unavailable monthly/wage amounts remain unavailable; verified zero drink bonus remains zero. |
| Chuck pay | Only self Chuck endpoint; incomplete net amount stays unavailable; missing-rate blocker precedes collapsed details; initial load does not fetch shared Analytics. |
| Nori pay | Only self Nori endpoint; owner income explicitly unavailable; server Chuck estimate, verified Haruka zero, and incomplete Kanata amount remain distinct; no staff/Chuck endpoint fallback. |
| Work history | Self history endpoint; unavailable hours remain unavailable; compact periods and peer Hours/Staff drinks controls; methodology stays collapsed. |
| Shift | Personal time clock is reached directly; existing staff/manager controls render without executing an action. Manager venue controls remain role-specific. |
| Account | Account settings is a distinct destination; account/password/sign-out controls render without writes. |

All API responses were intercepted on a loopback mock origin. Every scenario asserts zero non-GET requests. A fictional shift 99 was open in fixtures; production tickets, shifts, identities, rates and payroll records were not read or changed.

## Remaining acceptance boundaries

- Nori's own-income rule/source is still unconfirmed (API #69). The UI correctly presents unavailable; it must not derive owner income from revenue or staff totals.
- Browser endpoint assertions do not establish server authorization. API #74/#228 closure needs backend denial and configured-identity evidence alongside this UI review. Separate API #84 tests cover that contract; this document does not independently certify their production execution.
- Amounts are estimates from recorded inputs, not salary payment records. Incomplete historical inputs remain blockers, not zero balances.
- This review covers Profile. Full #266/#225 closure also requires the Admin evidence and remaining tracked cross-app findings; it does not claim all audit issues resolved.

No additional Profile layout defect was reproduced in this matrix. No application changes were made for this review.

## Reproduction

Run `npx playwright test tests/browser/profile-integrated-audit.spec.mjs` with the standard mock Playwright config. Screenshots are named `pay.png`, `history.png`, `shift.png`, and `account.png` within each role/locale/viewport result directory. Install a CJK font in the test environment before judging Japanese typography; missing-glyph squares are not valid Japanese visual evidence.
