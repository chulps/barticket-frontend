/** Coalesce refresh bursts and allow at most one trailing refresh during a read. */
export function createRefreshCoordinator(refreshTask: () => Promise<void>) {
    let inFlight: Promise<void> | null = null;
    let refreshPending = false;

    return function refresh() {
        refreshPending = true;
        if (inFlight) return inFlight;

        const run = async () => {
            while (refreshPending) {
                refreshPending = false;
                await refreshTask();
            }
        };

        const current = run().finally(() => {
            if (inFlight === current) inFlight = null;
            // Catch a trigger queued at the end of the loop, before finally ran.
            if (refreshPending) void refresh();
        });
        inFlight = current;
        return current;
    };
}
