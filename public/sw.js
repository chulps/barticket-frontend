/* BarTicket web push worker. Deliberately does not cache tickets, menus, or API data. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* malformed push */ }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "BarTicket";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 240) : "New activity";
  const type = typeof payload.type === "string" ? payload.type : "activity";
  const ticketId = Number.isSafeInteger(payload.ticket_id) && payload.ticket_id > 0 ? payload.ticket_id : null;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: new URL("favicon.svg", self.registration.scope).href,
    badge: new URL("favicon.svg", self.registration.scope).href,
    tag: type + (ticketId ? ":" + ticketId : ""),
    data: { url: new URL(type === "stock" ? "menu" : "tickets", self.registration.scope).href },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || self.registration.scope);
  if (target.origin !== self.location.origin || !target.href.startsWith(self.registration.scope)) return;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clientsList.find((client) => client.url.startsWith(self.registration.scope));
    if (existing) {
      await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
