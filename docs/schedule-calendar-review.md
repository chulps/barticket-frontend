# Schedule calendar and editor — local review checkpoint

Canonical frontend issue: https://github.com/chulps/barticket-frontend/issues/392
API companion: https://github.com/chulps/BarTicket-API/issues/120

## Intent and reference
Official Google Calendar references checked November 2, 2026:
- https://workspace.google.com/products/calendar/ (current interface/event-detail illustration)
- https://support.google.com/calendar/answer/6110849 (month navigation, today, mobile Schedule/Month views)

Adapted interaction patterns, not Google branding: flat month canvas, today marker, month navigation, compact date-only events, mobile agenda, day details and focused editor. Uses BarTicket dark palette and the shared #390 animated Select. No invented event/shift start/end times; date-only plans remain separate from worked shifts.

## Implemented scope
- Month grid with keyboard date movement, today, month navigation and agenda view. Mobile defaults to agenda and month header opens grid.
- Selected-day details open above mobile agenda and receive focus; source provenance is collapsed, not repeated in every calendar block.
- Manager-only create/edit dialog: date, event, manager, staff. Staff view is read-only; API separately enforces permissions.
- Opening row and revision frozen for edit; background refresh cannot authorize old draft overwrite. 409 leaves draft visible.
- Preserve name-only manager assignments, including imported Nori, without inferring account identity.
- No actual attendance, payroll, hours, revenue, push-notification changes.
- Month-only reads, six-entry session/range cache, sixty-second freshness, matching-request coalescing, hidden/offline timer suppression, stale response retirement and mutation invalidation.
- Cancel/Escape dirty guard, reload guard, numeric BrowserRouter history Back/Forward restoration. Real browser verification is mandatory.

## API contract and rollout
GET /schedules remains an array; rows gain revision. POST /schedules creates plan. PUT /schedules/{id} sends complete fields plus expected_revision. Existing rows without revision cannot be edited until API upgrade. Occupied date/stale revision 409; identical retry safely no-ops. API requires additive scheduled_shift_edits audit-table migration BEFORE new writes. Imported provenance remains intact; reimport differing manual edits conflicts instead of overwriting.

API patch: /workspace/shared/schedule-editor-api.patch. Independently source-reviewed; 282 no_db tests and focused independent 5/5 passed. PostgreSQL-backed concurrency tests exist but local PostgreSQL unavailable. Publication/migration/CI owned by parent; no production migration performed.

## Source review fixes
Independent reviewer caught and fixes include stale revision authorization, mobile details below month-long agenda, Create accidentally editing, name-only Nori options, invalid token names, unrelated storage logout behavior, 9px root typography, adjacent-date opacity contrast, explicit dialog centering and long-text wrapping. All new font declarations >=12px, explicit sizing independent of app's 9px root.

Computed palette contrasts (not rendered visual verification):
- Event text #f0f6ff / #253b54: 10.55:1.
- Event secondary #cbd5e1 / #253b54: 7.72:1.
- Muted #8d9095 / #222429: 4.85:1.
- Today white / #4169e1: 4.85:1.
- Focus #839ef0 / #222429: 6.00:1.

## Verification and limits
TypeScript, focused lint, all unit tests and production-configured build run locally; final counts in parent handoff. Existing security audit runs locally.
New synthetic-only browser specs cover EN/JA at320/768/1280; editor conflict, dirty cancel, stale revision, date-bounded reads, no staff writes, offline timer suppression and history handling. Legacy schedule browser specs adapted to new agenda/source-detail layout. No production credentials/data in fixtures.
Browser tests DID NOT execute: bundled Chromium missing; installed Chromium cannot create sandbox socket (EPERM). One escalation failed before execution with runtime bwrap read-only mount error. No bypass attempted. Actual screenshots, responsive overflow, focus, custom Select portal and repeated Back/Forward behavior remain required CI/browser gates; do not call pixels verified.

## Integration
Baseline snapshot corresponds shipped frontend49af03e / PR387. No edits to ScheduleImport.tsx. Select.tsx is a copied local dependency identical to #390 hash46a215232aac76619c55a186e7db9d93ab35b35629200f1a574d0185e1c3e044; EXCLUDED from this patch. Integrate after #390 component lands, rebase and re-run final checks. Local machine-only playwright.calendar.config.mjs is excluded (CI uses repository normal config/bundled Chromium).
