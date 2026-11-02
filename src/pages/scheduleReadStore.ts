/** Session-scoped, bounded cache. Invalidations retire pending pre-mutation reads. */
export function createScheduleReadStore<T>(read: (from: string, to: string) => Promise<T>, now = Date.now) {
    let session: string | null = null;
    let generation = 0;
    const cache = new Map<string, { value: T; at: number }>();
    const pending = new Map<string, Promise<T>>();
    const reset = (token: string | null) => { session = token; generation++; cache.clear(); pending.clear(); };
    return {
        invalidate: () => reset(session),
        reset,
        async load(token: string, from: string, to: string, force = false): Promise<T> {
            if (session !== token) reset(token);
            const key = `${from}:${to}`;
            const hit = cache.get(key);
            if (!force && hit && now() - hit.at < 60000) return hit.value;
            const ongoing = pending.get(key);
            if (ongoing) return ongoing;
            const version = generation;
            const request = read(from, to).then(value => {
                if (generation === version && session === token) {
                    if (cache.size >= 6) cache.delete(cache.keys().next().value!);
                    cache.set(key, { value, at: now() });
                }
                return value;
            }).finally(() => { if (pending.get(key) === request) pending.delete(key); });
            pending.set(key, request);
            return request;
        },
    };
}
