export const REALTIME_SCOPES = ["tickets", "menu", "shift", "notices", "analytics", "users", "session", "activity"] as const;
export type RealtimeScope = typeof REALTIME_SCOPES[number];

export type SocketLike = Pick<WebSocket, "onopen" | "onmessage" | "onerror" | "onclose" | "send" | "close">;

/** Authenticated invalidation transport. REST remains authoritative for data. */
export function createRealtimeConnection(options: {
  open: () => SocketLike;
  token: () => string | null;
  schedule: (callback: () => void, delay: number) => () => void;
  now: () => number;
  random: () => number;
  invalidate: (scopes: readonly RealtimeScope[]) => void;
  expired: () => void;
  activity?: (frame: unknown) => void;
  health?: (ready: boolean) => void;
}) {
  let stopped = true;
  let socket: SocketLike | null = null;
  let retry = () => {};
  let watchdog = () => {};
  let attempts = 0;
  let lastMessageAt = 0;
  let ready = false;
  const setReady = (next: boolean) => {
    if (ready === next) return;
    ready = next; options.health?.(next);
  };

  function checkAlive() {
    if (stopped || !socket) return;
    if (options.now() - lastMessageAt >= 15_000) {
      failed();
      return;
    }
    watchdog = options.schedule(checkAlive, 5_000);
  }

  function disconnect() {
    setReady(false);
    watchdog();
    const previous = socket;
    socket = null;
    if (previous) {
      previous.onopen = previous.onmessage = previous.onerror = previous.onclose = null;
      previous.close();
    }
  }

  function failed() {
    disconnect();
    if (stopped || !options.token()) return;
    retry();
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5)) + options.random() * 500;
    retry = options.schedule(connect, delay);
  }

  function connect() {
    if (stopped || socket) return;
    const token = options.token();
    if (!token) return;
    let current: SocketLike;
    try {
      current = options.open();
    } catch {
      failed();
      return;
    }
    socket = current;
    lastMessageAt = options.now();
    watchdog = options.schedule(checkAlive, 5_000);
    const active = () => !stopped && socket === current && options.token() === token;
    current.onopen = () => {
      if (active()) current.send(JSON.stringify({ type: "authenticate", token, capabilities: ["activity"] }));
    };
    current.onmessage = event => {
      if (!active()) return;
      try {
        const data = JSON.parse(event.data);
        if (data.version !== 1 || !Number.isSafeInteger(data.cursor) || data.cursor < 0) return;
        if (data.type === "ready") {
          lastMessageAt = options.now();
          attempts = 0;
          setReady(true);
          options.invalidate(REALTIME_SCOPES);
          return;
        }
        if (!ready) return;
        if (data.type === "activity") { lastMessageAt = options.now(); options.activity?.(data); return; }
        if (data.type !== "heartbeat" && data.type !== "invalidate") return;
        if (!Array.isArray(data.scopes) ||
            data.scopes.some((scope: unknown) => !REALTIME_SCOPES.includes(scope as RealtimeScope))) return;
        lastMessageAt = options.now();
        if (data.type === "invalidate" && data.scopes.length) options.invalidate(data.scopes);
      } catch {
        // Ignore malformed frames; polling remains active as the fallback.
      }
    };
    current.onerror = () => { if (active()) failed(); };
    current.onclose = event => {
      if (!active()) return;
      if (event.code === 4401) {
        stopped = true;
        disconnect();
        options.expired();
      } else failed();
    };
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      retry();
      disconnect();
    },
  };
}

