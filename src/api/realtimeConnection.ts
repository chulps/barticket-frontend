export const REALTIME_SCOPES = ["tickets", "menu", "shift", "notices", "analytics", "users", "session"] as const;
export type RealtimeScope = typeof REALTIME_SCOPES[number];

export type SocketLike = Pick<WebSocket, "onopen" | "onmessage" | "onerror" | "onclose" | "send" | "close">;

/** One authenticated transport. Timers and sockets are injected for deterministic
 * failure/reconnect tests; this module never sends business mutations. */
export function createRealtimeConnection(options: {
  open: () => SocketLike;
  token: () => string | null;
  schedule: (callback: () => void, delay: number) => () => void;
  now: () => number;
  random: () => number;
  health: (healthy: boolean) => void;
  invalidate: (scopes: readonly RealtimeScope[]) => void;
  expired: () => void;
}) {
  let stopped = true;
  let socket: SocketLike | null = null;
  let retry = () => {};
  let watchdog = () => {};
  let attempts = 0;
  let healthy = false;
  let lastMessage = 0;
  let cursor = -1;

  function setHealth(next: boolean) {
    if (healthy === next) return;
    healthy = next;
    options.health(next);
  }

  function disconnect() {
    watchdog();
    const previous = socket;
    socket = null;
    if (previous) {
      previous.onopen = previous.onmessage = previous.onerror = previous.onclose = null;
      previous.close();
    }
    setHealth(false);
  }

  function failed() {
    disconnect();
    if (stopped || !options.token()) return;
    retry();
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)) + options.random() * 500;
    retry = options.schedule(connect, delay);
  }

  function checkAlive() {
    if (stopped || !socket) return;
    if (options.now() - lastMessage >= 15_000) { failed(); return; }
    watchdog = options.schedule(checkAlive, 5000);
  }

  function connect() {
    if (stopped || socket) return;
    const token = options.token();
    if (!token) return;
    let current: SocketLike;
    try { current = options.open(); } catch { failed(); return; }
    socket = current;
    lastMessage = options.now();
    cursor = -1;
    watchdog = options.schedule(checkAlive, 5000);
    const active = () => !stopped && socket === current && options.token() === token;
    current.onopen = () => {
      if (!active()) return;
      current.send(JSON.stringify({ type: "authenticate", token }));
    };
    current.onmessage = (event) => {
      if (!active()) return;
      try {
        const data = JSON.parse(event.data);
        if (data.version !== 1 || !Number.isSafeInteger(data.cursor) || data.cursor < 0) return;
        if (data.type === "ready" && !healthy) {
          cursor = data.cursor;
          lastMessage = options.now();
          attempts = 0;
          setHealth(true);
          // Every connection starts from fresh authoritative snapshots. The
          // server cursor was captured before ready, so racing writes follow.
          options.invalidate(REALTIME_SCOPES);
        } else if (healthy && (data.type === "heartbeat" || data.type === "invalidate")) {
          if (data.cursor < cursor || !Array.isArray(data.scopes) ||
              data.scopes.some((scope: unknown) => !REALTIME_SCOPES.includes(scope as RealtimeScope))) return;
          lastMessage = options.now();
          if (data.type === "invalidate" && data.cursor > cursor) options.invalidate(data.scopes);
          cursor = data.cursor;
        }
      } catch { /* An invalid frame cannot establish or extend socket health. */ }
    };
    current.onerror = () => { if (active()) failed(); };
    current.onclose = (event) => {
      if (!active()) return;
      if (event.code === 4401) {
        stopped = true;
        disconnect();
        options.expired();
      } else failed();
    };
  }

  return {
    start() { if (!stopped) return; stopped = false; connect(); },
    stop() { stopped = true; retry(); disconnect(); },
    healthy: () => healthy,
  };
}
