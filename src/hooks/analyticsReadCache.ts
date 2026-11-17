/** Bounded memory-only, session-isolated cache. Never persists sales or tokens. */
export function createAnalyticsReadCache<T>(maxEntries = 8, ttlMs = 30_000, now = Date.now) {
    let owner: string | null = null;
    let generation = 0;
    const entries = new Map<string, {value:T; time:number}>();
    const pending = new Map<string, Promise<T>>();
    function clear() { generation++; entries.clear(); pending.clear(); }
    return {
        clear,
        async read(token:string, key:string, load:()=>Promise<T>):Promise<T> {
            if (owner !== token) { clear(); owner=token; }
            const cached=entries.get(key);
            if (cached && now()-cached.time < ttlMs) { entries.delete(key); entries.set(key,cached); return cached.value; }
            const inflight=pending.get(key); if(inflight) return inflight;
            const version=generation;
            const promise=load().then(value=>{
                if(generation!==version || owner!==token) throw new Error('Analytics read invalidated');
                entries.delete(key);entries.set(key,{value,time:now()});
                while(entries.size>maxEntries) entries.delete(entries.keys().next().value!);
                return value;
            }).finally(()=>{if(pending.get(key)===promise) pending.delete(key);});
            pending.set(key,promise);return promise;
        },
    };
}
