# Dropdown caret inventory — #332

Baseline: main `127069d98ed8e74e7cab2e095709e81e5a929147`.

The supplied mobile Admin screenshot shows Accounts without an arrow. Global
`select { appearance: none }` removed native arrows; most selects supplied no
replacement. AdminPanels/Reconciliation used ▾ text, MenuItemForm used ⌄ text.

## Canonical treatment

All single-choice native selects now use the shared `--dropdown-caret-*` tokens
in index.css: Phosphor CaretDown **regular**, 18px, 14px from the right edge,
10px label gap, vertically centered. The path matches the existing Icon registry's
CaretDown. A CSS background cannot capture pointer events or enter the accessibility
tree. No JS open-state simulation or rotation is added to OS-owned select popups.
Only indicator/padding properties override component shorthands; existing native
labels, focus, disabled state, option values and handlers remain unchanged.
Forced-colors restores the native OS indicator. Listboxes/multiple selects are
excluded. No UI dependency, API, storage, or data behavior changes.

## Full source inventory

| Area | Native dropdowns |
| --- | --- |
| Admin | Mobile section picker; new-account role |
| AdminPanels | Staff-directory role filter |
| AdminPayments | Provider; payment channel |
| AdminTeamEditors | Bonus shift |
| AdminManagerShare | Cost treatment |
| AdminPayDeductions | Beneficiary; category |
| Receivables | Status; reason |
| Reconciliation | CSV mappings; staff; guest; contract; event; extra staff |
| ScheduleImport | Date, manager, staff, event, uncertainty mappings |
| StaffIncome | Category; sort order |
| AnalyticsReportActions | Report language |
| MenuItemForm | Category; subcategory |
| CoverChargeModal | Returning source ticket |
| DeferPaymentModal | Reason |

Custom DropdownMenu triggers in MenuItemRow and TicketItem are **overflow actions**,
not selection fields: preserve three-dot/X icons and menu keyboard/focus handling.
The separately pending notification three-dot control is also unchanged. Analytics
accordion arrows, quantity up/down arrows, date navigation and details/summary
markers are not dropdown selection indicators and are intentionally unchanged.

## Verification

Source tests enforce the exact canonical icon path, shared geometry, no text-caret
fallbacks, and untouched overflow/quantity icons. Browser coverage uses only mocked
localhost API calls, EN/JA at 320/390/1280px, computed image/spacing, native keyboard
selection, Admin selection and history, forced-colors and horizontal-overflow checks.
This is Chromium coverage, not a claim of physical iOS/Android device testing.

Local results: 437/437 unit tests pass; TypeScript/production build and security
source/dist audits pass; lint passes with the pre-existing ShiftCloseReview hook
warning. Browser scenarios were authored but **not run**: Chromium socket creation
is blocked by the local sandbox, and the one escalated launch failed before
execution due to the read-only runtime sessions mount. CI must establish browser
results before this change is considered visually verified.
