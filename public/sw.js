/* BarTicket web push worker. Deliberately does not cache tickets, menus, or API data. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* malformed push */ }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "BarTicket";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 240) : "New activity";
  const type = typeof payload.type === "string" ? payload.type : "activity";
  const ticketId = Number.isSafeInteger(payload.ticket_id) && payload.ticket_id > 0 ? payload.ticket_id : null;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map((client) => client.postMessage({ type: "barticket-push", eventType: type })));
    await self.registration.showNotification(title, {
    body,
    icon: new URL("favicon.svg", self.registration.scope).href,
    badge: new URL("favicon.svg", self.registration.scope).href,
    tag: type + (ticketId ? ":" + ticketId : ""),
    data: { url: notificationTarget(type, ticketId).href },
  });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const fallback = new URL("notifications?from_push=1", self.registration.scope);
  let target = fallback;
  try {
    const candidate = new URL(event.notification.data?.url || fallback.href);
    if (candidate.origin === fallback.origin && candidate.pathname === fallback.pathname) {
      const ticket = candidate.searchParams.get("ticket");
      if (ticket && /^[1-9]\d*$/.test(ticket) && Number.isSafeInteger(Number(ticket))) fallback.searchParams.set("ticket", ticket);
      target = fallback;
    }
  } catch { /* Invalid or legacy destination falls back to Notifications. */ }
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsList.find((client) => client.url === target.href);
    if (existing) {
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});

// Only ticket-bearing event types may select a ticket. All other activity opens
// Notifications until its payload has a supported, authorized entity target.
function notificationTarget(type, ticketId) {
  const url = new URL("notifications?from_push=1", self.registration.scope);
  const ticketEvents = ["ticket_created", "ticket_updated", "ticket_payment_recorded",
    "ticket_payment_deferred", "ticket_balance_written_off", "ticket_payment_corrected",
    "ticket_closed", "staff_drink"];
  if (ticketId && ticketEvents.includes(type)) url.searchParams.set("ticket", String(ticketId));
  return url;
}
