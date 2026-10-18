# Socket-first updates and PWA push (review only)

Depends on backend PR and migration described in the paired backend
`docs/realtime.md`. Do not merge or deploy either PR without approval.

One socket per open app authenticates through a first-frame bearer message at
`/realtime/ws`. Healthy means a validated protocol-v1 `ready` was received,
followed by valid heartbeats/events within 15 seconds; a TCP open alone never
disables polling. Invalidations carry scopes only, and existing REST endpoints
remain authoritative for reads and all business writes.

The shared connection reconnects with jittered exponential delays capped at
30 seconds. Every ready causes fresh reads of all mounted resources, catching
events missed during disconnect, tab suspension or server rotation. Old socket
frames are ignored after logout/account change. A 4401 close revalidates the
session instead of repeatedly reconnecting with a revoked token.

Existing network polling is gated while the socket is healthy; it resumes on
connection failure/watchdog timeout and while the REST API is unavailable.
Polling and sockets pause for hidden/offline tabs. Visibility/network recovery
reconnects and refreshes. UI clock timers continue because they do no I/O.

Scoped readers cover tickets, global menu, archived items, current shift and
punches, navigation role/notices, Notifications, Analytics, Profile, staff work
history and Admin. Event bursts coalesce. Ticket revision guards, queued writes,
name drafts and menu mutation protections remain in use; reads skipped during
pending writes are retried after the write. Writes are never replayed on a
socket reconnect or by a push message.

PWA subscriptions are confirmed against the current server session, rather
than inferred from a browser subscription alone. The permission prompt starts
directly from the user's tap. Existing subscriptions can be re-registered after
the backend migration. Sign-out browser cleanup is serialized before a new
account subscribes. The worker refreshes foreground clients and displays OS
alerts for background/closed apps. Taps route to an exact ticket (including paid
tickets), the menu for stock, or Profile for shift/punch changes. Routes remain
inside the GitHub Pages base path. English and Japanese settings explain iPhone
installation and blocked permission states.

Before release, verify Vercel Fluid Compute/Python socket support and enable
`REALTIME_ENABLED=1` on an approved backend with its migration applied. Confirm
VAPID settings without exposing private keys. Test two actual devices, including
an installed iPhone Home Screen PWA, for background/closed-app push delivery.
CI validates protocol behavior, fallback, worker routing and API session rules;
it cannot prove Apple/Google push delivery or production host configuration.
