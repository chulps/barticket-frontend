/** Serialize refresh reads; coalesce requests received while one is active.
 * The revision token also protects optimistic mutations from stale results.
 * No mutation is ever automatically retried by this coordinator. */
export function createSingleFlightRefresh<T>(callbacks: {
  read: () => Promise<T>;
  currentRevision: () => number;
  onSnapshot: (data: T) => void;
  onError: (error: unknown) => void;
  onSettled: () => void;
}) {
  let disposed = false;
  let inFlight = false;
  let queued = false;

  function request() {
    if (disposed) return;
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    const revision = callbacks.currentRevision();
    // Schedule asynchronous work only; never let a synchronous throw bypass
    // the cleanup path or permanently block future refresh requests.
    void Promise.resolve()
      .then(() => callbacks.read())
      .then(
        data => {
          if (!disposed && revision === callbacks.currentRevision()) callbacks.onSnapshot(data);
          else if (!disposed) queued = true;
        },
        error => {
          if (!disposed && revision === callbacks.currentRevision()) callbacks.onError(error);
        },
      )
      .finally(() => {
        if (disposed) return;
        callbacks.onSettled();
        inFlight = false;
        if (queued) {
          queued = false;
          request();
        }
      });
  }

  return {
    request,
    dispose() {
      disposed = true;
      queued = false;
    },
  };
}
