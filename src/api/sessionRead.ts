/** Share a short-lived successful session read, never a rejected or obsolete one.
 * Only in memory; token changes and invalidation retire pending requests as well. */
export function createSessionRead<T>(
    session: () => string | null,
    fetchSession: () => Promise<T>,
    now: () => number = Date.now,
    reuseMs = 1000,
) {
    let epoch = 0;
    let entry: { token: string; epoch: number; promise: Promise<T>; settledAt: number | null } | null = null;
    function invalidate() {
        epoch++;
        entry = null;
    }
    function read(): Promise<T> {
        const token = session();
        if (!token) { invalidate(); return fetchSession(); }
        if (entry && entry.token !== token) invalidate();
        if (entry?.token === token && entry.epoch === epoch &&
            (entry.settledAt === null || now() - entry.settledAt < reuseMs)) return entry.promise;
        const requestEpoch = epoch;
        const next = { token, epoch: requestEpoch, promise: null as unknown as Promise<T>, settledAt: null as number | null };
        next.promise = fetchSession().then(value => {
            if (session() !== token || requestEpoch !== epoch) throw new Error("Session changed during account verification");
            next.settledAt = now();
            return value;
        }).catch(error => {
            if (entry === next) entry = null;
            throw error;
        });
        entry = next;
        return next.promise;
    }
    return { read, invalidate };
}
