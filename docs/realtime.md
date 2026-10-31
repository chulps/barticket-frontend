# Live ticket updates

Signed-in clients connect to the API's authenticated `/realtime/ws` endpoint.
The socket sends resource invalidations only; the app reloads authoritative
data through its existing REST endpoints. The connection starts for every
authenticated session and does not depend on whether the user is clocked in.

Ticket changes refresh the ticket list on every connected device. A ready frame
also triggers a refresh so reconnecting clients catch up. The frontend keeps
fallback polling for tickets, menu, notices, and Header identity until a valid
version-1 ready frame. These timers pause while the socket is healthy. A REST
availability failure latches fallback for that connection generation: an
unrelated successful read cannot hide a stale consumer. The app reconnects
with backoff after a socket failure or 15-second missed heartbeat, and reconnects when it returns online
or to the foreground. Backgrounded devices refresh when foregrounded.

Web Push is separate from live ticket updates. This change neither subscribes
devices to push nor changes push recipients; push remains governed by the
backend's clocked-in recipient rule.


Dashboard, ShiftControls, and Analytics retain periodic reads because server-derived
worked hours grow with wall-clock time even without mutations. Local clock ticks
also remain active. Explicit focus/retry requests always work. Scoped events refresh
mounted Profile earnings/history/owner summaries and account capabilities; successful
background refreshes preserve open disclosures and typed drafts. Reads overtaken by
local writes are deferred/coalesced and retried after settlement; writes are never
replayed by realtime.

Deploy after backend PR93 (punch corrections, manager assignments, revenue-share
policy invalidations). Tests cover two isolated socket clients and two browser pages,
ready/heartbeat/reconnect, REST fallback latching, notification reads during held
mutations, and preserved pay disclosures/account drafts. These are fixture tests,
not a claim of a physical-device cloud WebSocket or push delivery check. Web Push
physical-device acceptance remains a separate backend staging runbook.
