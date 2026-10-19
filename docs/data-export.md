# Frontend JSON exports

Signed-in users can download Menu JSON (all active and archived items, prices, stock and cover charge). Managers can also download Admin JSON (active team accounts, shifts and closed-shift reports) and All Time analytics JSON (all of those plus raw tickets and current/latest active notices).

Downloads use the existing authenticated GET endpoints, fetch fresh data on click, preserve API fields without converting tickets into display models, and do not apply the current date/search/status filter. Embedded ticket items/payments and shift punches/staff drinks/stockouts are retained. Cancelled tickets remain cancellation audit records; downloading never changes historical analytics totals.

Each file contains a format/schema version, scope, request start/end timestamps, source endpoints, record counts, success/failure status and limitations. Missing sources produce a visibly partial filename and message. A failed request is not silently treated as an empty list. Expired/changed sessions and cancellation stop the export; a wholly failed export produces no download. Requests time out after 60 seconds each. No authentication tokens, local storage, passwords or server credentials are added to exports.

This is **not a full database backup**, a transaction-consistent snapshot, or an automatic restore/import format. The API omits password hashes, sessions, push registrations, deleted/inactive users and various internal IDs. Notices expose only active notices for the current/latest shift, although shift reports expose historical stockout summaries. Browser-only payroll/time/rate drafts and server configuration are not exported. Preserve the JSON securely; team records contain names and email addresses.

No backend changes, new endpoints, database writes or new packages are required.
