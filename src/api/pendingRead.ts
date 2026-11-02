/** Coalesce only overlapping reads of the same explicit scope. Never caches a result.
 * Call retire after mutations/auth changes so pre-change work cannot be reused. */
export function createPendingRead<T>() {
    let pending: { key: string; promise: Promise<T> } | null = null;
    function retire() { pending = null; }
    function read(key: string, load: () => Promise<T>): Promise<T> {
        if (pending?.key === key) return pending.promise;
        const entry = { key, promise: null as unknown as Promise<T> };
        entry.promise = Promise.resolve().then(load).finally(() => {
            if (pending === entry) pending = null;
        });
        pending = entry;
        return entry.promise;
    }
    return { read, retire };
}
