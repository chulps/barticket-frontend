/* BarTicket web push worker. Deliberately does not cache tickets, menus, or API data. */
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* malformed push */ }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 120) : "BarTicket";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 240) : "New activity";
  const type = typeof payload.type === "string" ? payload.type : "activity";
  const ticketId = Number.isSafeInteger(payload.ticket_id) && payload.ticket_id > 0 ? payload.ticket_id : null;
  const route = type === "stock" ? "menu" : type.startsWith("shift_") || type.startsWith("clock_") ? "profile" : "tickets";
  const target = new URL(route, self.registration.scope);
  if (route === "tickets" && ticketId) target.searchParams.set("ticket", String(ticketId));
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map((client) => client.postMessage({ type: "barticket-push", eventType: type })));
    // Safari requires every delivered userVisibleOnly push to display a
    // notification, including when a window is visible. Never silently drop it.
    await self.registration.showNotification(title, {
    body,
    icon: new URL("favicon.svg", self.registration.scope).href,
    badge: new URL("favicon.svg", self.registration.scope).href,
    tag: type + (ticketId ? ":" + ticketId : ""),
    data: { url: target.href },
  });
  })());
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
