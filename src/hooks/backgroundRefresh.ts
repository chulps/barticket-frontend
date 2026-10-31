/** Visible-only reads, fallback polling, and one trailing read for mid-request changes. */
export function startBackgroundRefresh(options: {
    refresh: () => Promise<void>;
    shouldPoll: () => boolean;
    events: string[];
    intervalMs?: number;
    refreshKey?: () => string;
    window?: Window;
    document?: Document;
}) {
    const win = options.window ?? window;
    const doc = options.document ?? document;
    let stopped = false;
    let running = false;
    let pending = false;
    let debounce: number | undefined;
    const visible = () => doc.visibilityState !== "hidden" && win.navigator.onLine !== false;
    async function run() {
        debounce = undefined;
        if (stopped || running || !pending || !visible()) return;
        pending = false;
        running = true;
        try { await options.refresh(); }
        finally {
            running = false;
            if (pending && !stopped && visible()) schedule();
        }
    }
    function schedule() {
        if (stopped) return;
        pending = true;
        if (!visible() || running || debounce !== undefined) return;
        // Collapse focus/visibility/reconnect and compatibility-event fanout.
        debounce = win.setTimeout(() => { void run().catch(() => {}); }, 60);
    }
    const events = [...new Set(["focus", "online", "barticket-api-restored", ...options.events])];
    events.forEach(event => win.addEventListener(event, schedule));
    doc.addEventListener("visibilitychange", schedule);
    let refreshKey = options.refreshKey?.();
    const timer = win.setInterval(() => {
        const nextKey = options.refreshKey?.();
        const rolledOver = nextKey !== refreshKey;
        refreshKey = nextKey;
        if (rolledOver || options.shouldPoll()) schedule();
    }, options.intervalMs ?? 20_000);
    schedule();
    return () => {
        stopped = true;
        win.clearInterval(timer);
        if (debounce !== undefined) win.clearTimeout(debounce);
        events.forEach(event => win.removeEventListener(event, schedule));
        doc.removeEventListener("visibilitychange", schedule);
    };
}
