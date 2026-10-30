import { API_URL, getToken } from "./client";
import { createRealtimeConnection, type RealtimeScope } from "./realtimeConnection";

function dispatchInvalidation(scopes: readonly RealtimeScope[]) {
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
    expired: () => window.dispatchEvent(new Event("barticket-session-expired")),
  });

  const restart = () => {
    connection.stop();
    if (getToken() && navigator.onLine !== false) connection.start();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") connection.stop();
    else restart();
  };
  const onOffline = () => connection.stop();
  restart();
  window.addEventListener("barticket-auth", restart);
  window.addEventListener("online", restart);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.removeEventListener("barticket-auth", restart);
    window.removeEventListener("online", restart);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    connection.stop();
  };
}
