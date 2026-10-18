import { API_URL, getToken, isApiAvailable } from "./client";
import { createRealtimeConnection, REALTIME_SCOPES, type RealtimeScope } from "./realtimeConnection";

let healthy = false;

function announce(scopes: readonly RealtimeScope[]) {
  window.dispatchEvent(new CustomEvent("barticket-realtime", { detail: { scopes } }));
}

export function shouldPoll(): boolean {
  return (!healthy || !isApiAvailable()) && document.visibilityState !== "hidden" && navigator.onLine !== false;
}

export function startRealtime() {
  const url = new URL(API_URL + "/realtime/ws");
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const connection = createRealtimeConnection({
    open: () => new WebSocket(url),
    token: getToken,
    schedule: (fn, ms) => { const timer = window.setTimeout(fn, ms); return () => window.clearTimeout(timer); },
    now: Date.now,
    random: Math.random,
    health: (next) => {
      healthy = next;
      if (!next) announce(REALTIME_SCOPES); // immediate fallback reconciliation
    },
    invalidate: announce,
    expired: () => window.dispatchEvent(new Event("barticket-session-expired")),
  });
  const restart = () => {
    connection.stop();
    if (getToken() && document.visibilityState !== "hidden" && navigator.onLine !== false && "WebSocket" in window) connection.start();
  };
  restart();
  const events = ["barticket-auth", "online", "offline"];
  events.forEach(name => window.addEventListener(name, restart));
  document.addEventListener("visibilitychange", restart);
  return () => {
    events.forEach(name => window.removeEventListener(name, restart));
    document.removeEventListener("visibilitychange", restart);
    connection.stop();
  };
}

/** Coalesce event bursts and retry reads skipped by a pending optimistic write.
 * Returning false asks for another read; business writes are never retried. */
export function subscribeRealtime(scopes: readonly RealtimeScope[], refresh: () => unknown | Promise<unknown>) {
  let disposed = false;
  let timer: number | undefined;
  let running = false;
  let queued = false;
  const schedule = (delay = 60) => {
    if (disposed) return;
    if (running) { queued = true; return; }
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => { timer = undefined; void run(); }, delay);
  };
  async function run() {
    if (disposed || document.visibilityState === "hidden" || navigator.onLine === false) return;
    running = true;
    try { if (await refresh() === false) queued = true; }
    catch { /* Existing screen error handling and polling handle failed reads. */ }
    finally {
      running = false;
      if (queued) { queued = false; schedule(250); }
    }
  }
  const receive = (event: Event) => {
    const detail = (event as CustomEvent<{ scopes?: unknown }>).detail;
    if (Array.isArray(detail?.scopes) && detail.scopes.some(scope => scopes.includes(scope))) schedule();
  };
  const resume = () => schedule();
  window.addEventListener("barticket-realtime", receive);
  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", resume);
  return () => {
    disposed = true;
    if (timer !== undefined) window.clearTimeout(timer);
    window.removeEventListener("barticket-realtime", receive);
    window.removeEventListener("online", resume);
    document.removeEventListener("visibilitychange", resume);
  };
}
