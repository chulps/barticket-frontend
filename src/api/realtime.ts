import { receiveNotificationActivity, resetActivityAccount, activityConnectionChanged } from "./notificationActivityStore";
import { API_URL, getToken, isApiAvailable } from "./client";
import { createRealtimeConnection, REALTIME_SCOPES, type RealtimeScope } from "./realtimeConnection";

let healthy = false;
let restHealthy = true;
/** Timers are fallback only; explicit refreshes and local clocks remain active. */
export function shouldPoll(): boolean {
  return (!healthy || !restHealthy || !isApiAvailable()) && document.visibilityState !== "hidden" && navigator.onLine !== false;
}

function dispatchInvalidation(scopes: readonly RealtimeScope[]) {
  window.dispatchEvent(new CustomEvent("barticket-realtime", { detail: { scopes } }));
  if (scopes.includes("analytics")) window.dispatchEvent(new Event("barticket-analytics-updated"));
  if (scopes.includes("users") || scopes.includes("session")) window.dispatchEvent(new Event("barticket-users-updated"));
  if (scopes.includes("tickets")) window.dispatchEvent(new Event("barticket-push"));
  if (scopes.includes("shift")) window.dispatchEvent(new Event("barticket-shift-updated"));
  if (scopes.includes("menu")) window.dispatchEvent(new Event("barticket-menu-updated"));
  if (scopes.includes("notices")) window.dispatchEvent(new Event("barticket-notices"));
}

/** Start while signed in, independent of the user's clock-in state. */
export function startRealtime() {
  if (!("WebSocket" in window)) return () => {};
  const url = new URL(`${API_URL}/realtime/ws`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const connection = createRealtimeConnection({
    open: () => new WebSocket(url),
    token: getToken,
    schedule: (fn, delay) => {
      const timer = window.setTimeout(fn, delay);
      return () => window.clearTimeout(timer);
    },
    now: Date.now,
    random: Math.random,
    invalidate: dispatchInvalidation,
    activity: frame => receiveNotificationActivity(frame, getToken()),
    health: ready => {
      healthy = ready;
      activityConnectionChanged(ready);
      if (ready) restHealthy = true;
      if (!ready && getToken() && document.visibilityState !== "hidden" && navigator.onLine !== false) dispatchInvalidation(REALTIME_SCOPES);
    },
    expired: () => window.dispatchEvent(new Event("barticket-session-expired")),
  });

  const restart = () => {
    resetActivityAccount(getToken());
    connection.stop();
    if (getToken() && navigator.onLine !== false && document.visibilityState !== "hidden") connection.start();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") connection.stop();
    else restart();
  };
  const onOffline = () => connection.stop();
  const onRestStatus = () => {
    // One failed read keeps fallback active for this connection generation.
    // An unrelated successful endpoint must not hide a stale consumer.
    if (!isApiAvailable()) restHealthy = false;
  };
  restart();
  window.addEventListener("barticket-api-status", onRestStatus);
  window.addEventListener("barticket-auth", restart);
  window.addEventListener("online", restart);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.removeEventListener("barticket-api-status", onRestStatus);
    window.removeEventListener("barticket-auth", restart);
    window.removeEventListener("online", restart);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    connection.stop();
  };
}

/** Listen for scoped read invalidations, coalescing bursts without touching drafts. */
export function subscribeRealtime(scopes: readonly RealtimeScope[], refresh: () => void) {
  let timer: number | undefined;
  const receive = (event: Event) => {
    const incoming = (event as CustomEvent<{scopes?: unknown}>).detail?.scopes;
    if (!Array.isArray(incoming) || !incoming.some(scope => scopes.includes(scope))) return;
    if (timer !== undefined) return;
    timer = window.setTimeout(() => { timer = undefined; refresh(); }, 60);
  };
  window.addEventListener("barticket-realtime", receive);
  return () => { window.removeEventListener("barticket-realtime", receive); if (timer !== undefined) window.clearTimeout(timer); };
}

