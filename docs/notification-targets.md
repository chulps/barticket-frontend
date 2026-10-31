# Push destinations

The service worker derives an allowlisted destination from the event type and a positive integer ticket ID. It does not trust arbitrary URLs from payloads. `/notifications` is the fallback, under the configured app base path.

| Event | Destination |
| --- | --- |
| ticket_created, ticket_updated, ticket_payment_recorded, ticket_payment_deferred, ticket_balance_written_off, ticket_payment_corrected, ticket_closed, staff_drink with ticket_id | `/notifications?ticket=ID&from_push=1`, showing the referenced ticket read-only |
| Same events without a valid ticket_id | `/notifications?from_push=1` |
| stock, clock_in, clock_out, noon_clock_out, shift_closed, shift_kept_open, punch_corrected | Notifications fallback; these payloads do not currently provide a supported entity ID |
| Unknown or malformed event/legacy destination | Notifications fallback |

The linked ticket is fetched through the authenticated ticket endpoint. It can be read even when its shift is no longer current. Missing, inaccessible, or failed targets explain the fallback above the normal notification screen. A tap never performs a ticket action.

The worker focuses an existing exact destination, otherwise opens a new app window. It never navigates an unrelated existing window, preserving unsaved forms and queued ticket edits. Browser/OS window reuse behavior remains platform-controlled; physical installed-PWA verification is still part of release qualification.

A same-tab session-storage destination (30 minute expiry, exact same-origin/path validation) resumes a tapped notification after sign-in. It contains no credentials or ticket data and is cleared after resolution. Account switches still use the app's auth boundary and ticket access is rechecked server-side.

This feature does not enable VAPID, alter push recipient eligibility, or enable realtime transport. Backend recipient filtering is tracked in #80/PR83. Physical iPhone/background notification delivery remains a separate verification task (#76).
