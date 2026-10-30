# Live ticket updates

Signed-in clients connect to the API's authenticated `/realtime/ws` endpoint.
The socket sends resource invalidations only; the app reloads authoritative
data through its existing REST endpoints. The connection starts for every
authenticated session and does not depend on whether the user is clocked in.

Ticket changes refresh the ticket list on every connected device. A ready frame
also triggers a refresh so reconnecting clients catch up. The frontend keeps
its existing polling active as a fallback, reconnects with backoff after a
socket failure or missed heartbeat, and reconnects when the app returns online
or to the foreground. Backgrounded devices refresh when foregrounded.

Web Push is separate from live ticket updates. This change neither subscribes
devices to push nor changes push recipients; push remains governed by the
backend's clocked-in recipient rule.
