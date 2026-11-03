import { getToken } from "./client";

const KEY = "barticket-notification-return";
const MAX_AGE = 30 * 60 * 1000;

/** Exact in-app allowlist; entity IDs are only hints and are re-authorized by the API. */
export function notificationDestination(value: string, base: string): string | null {
  try {
    const scope = new URL(base, window.location.origin);
    const url = new URL(value, scope);
    if (url.origin !== scope.origin) return null;
    let result: URL;
    if (url.pathname === `${scope.pathname}notifications`) {
      result = new URL("notifications", scope);
      const ticket = url.searchParams.get("ticket");
      if (ticket && /^[1-9]\d*$/.test(ticket) && Number.isSafeInteger(Number(ticket))) result.searchParams.set("ticket", ticket);
    } else if (url.pathname === `${scope.pathname}schedules`) {
      const requestId = url.searchParams.get("time_off");
      result = new URL("schedules", scope);
      const reservationId = url.searchParams.get("reservation");
      if (requestId && /^[1-9]\d*$/.test(requestId) && Number.isSafeInteger(Number(requestId))) result.searchParams.set("time_off", requestId);
      else if (reservationId && /^[1-9]\d*$/.test(reservationId) && Number.isSafeInteger(Number(reservationId))) result.searchParams.set("reservation", reservationId);
      else return null;
    } else return null;
    result.searchParams.set("from_push", "1");
    return result.href;
  } catch { return null; }
}

/** Remember only the tapped destination, never credentials or ticket contents. */
export function installNotificationReturn() {
  const base = import.meta.env.BASE_URL;
  if (new URL(window.location.href).searchParams.get("from_push") === "1") {
    const url = notificationDestination(window.location.href, base);
    if (url) {
      try { sessionStorage.setItem(KEY, JSON.stringify({url, at:Date.now()})); } catch { /* Storage may be disabled. */ }
    }
  }
  window.addEventListener("barticket-auth", () => {
    if (!getToken()) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (!saved) return;
      sessionStorage.removeItem(KEY);
      if (typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE || saved.at > Date.now()) return;
      const url = typeof saved.url === "string" ? notificationDestination(saved.url, base) : null;
      if (url && url !== window.location.href) window.location.replace(url);
    } catch { /* Ignore invalid or disabled storage. */ }
  });
}

export function clearNotificationReturn() {
  try { sessionStorage.removeItem(KEY); } catch { /* Storage may be disabled. */ }
}
