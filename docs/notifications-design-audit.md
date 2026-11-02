# Notifications activity design audit — issue #385

## Scope and coverage
Full scoped review of Notifications current-shift activity, React/styled-components and existing dark tokens. Actual user screenshot IMG_1608.png inspected. Baseline frontend main 6381501fce8c9b9f2ec41976598f67eea2733457. Original supplied Accessibility Review, Better Interface and Bento Brand Board source texts consulted; combined local skill was lost in environment reset. Bento poster composition is not applicable to this operational app.

| Domain | Evidence | Result |
| --- | --- | --- |
| Accessibility | Actual baseline screenshot, semantic source, fixture checks | Explicit links/list preserved; larger targets/focus added. Runtime pending. |
| Layout | Baseline screenshot and Notifications/NotificationActivity | Flat rows, aligned metadata, wrapping names; runtime pending. |
| Writing | Existing EN/JA feed policy and event labels | Shorter policy text, distinct unnamed/unavailable states. |
| Typography | Existing token scale and screenshot | Page and section hierarchy reduced, quiet tabular timestamps. |
| UI polish | Existing theme and frequency of events | No new animation or nested cards. |

## Findings and changes
| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| Medium | Layout | NotificationActivity list | Default bullets, event/time/link share one crowded line | Flat list rows, event/time metadata and separate ticket link | Scan activity and identify the ticket on narrow screens. |
| Medium | Writing | ActivityItem/ticket link | Number only | Number then authoritative current name; blank=Unnamed ticket, absent/null=Name unavailable | Distinguish tickets without extra network requests or invented names. |
| Medium | Typography | Notifications heading, activity heading | Competing large headings and full-weight helper text | Existing h3/h4 size tokens and subdued helper/time | Content takes priority over chrome. |
| Medium | Accessibility | Activity ticket links | Small inline link | Underlined, wrapping link with >=44px target and visible focus | Clear interaction and comfortable touch target. |

## Considered but rejected
- Cards around every event: increases nesting and noise; flat rows are sufficient.
- New entrance animation per incoming event: repeated operational activity should not distract; existing motion elsewhere unchanged.
- Frontend ticket detail lookup per event: N+1 requests, permission/lifecycle complications. API companion #118 supplies bounded authorized name projection.
- Treat missing name as unnamed: unknown/deleted/legacy payload is not evidence of an intentionally unnamed ticket.

## Verification
- Full unit suite: 585 passed at initial implementation (including name validation); rerun after integration required.
- Configured build/typecheck: `VITE_API_URL=http://127.0.0.1:8765 npm run build` passed; full app bundle produced (unconfigured build intentionally contains a production API configuration throw). Lint: no errors, two pre-existing ref-cleanup warnings in unrelated historical/reconciliation screens.
- Added browser fixtures: EN/JA x 320/390/768, named/blank/null tickets, long names, keyboard focus, minimum target and overflow checks; existing lifecycle and historical tests retained.
- Static token contrast against #1b1d21: neutral-200 8.13:1, royal-300 6.52:1, royal-200 focus/hover 8.91:1; rendered backgrounds still require browser verification.
- Browser execution NOT VERIFIED: bundled Chromium absent; system Chromium failed socket permission; supported escalated execution failed before browser with runner bwrap read-only sessions path. No bypass attempted. Remote CI and actual screenshot inspection required.
- No production data changed. No publication/deployment claimed.

## Verdict
Needs changes — pending runtime visual/interaction verification before release.
