// Serialize browser subscription changes and session cleanup. A failed operation
// rejects its caller but must not prevent later sign-out cleanup from running.
let pending: Promise<unknown> = Promise.resolve();
export function serializePushOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result.catch(() => undefined);
  return result;
}

// Never let an unreachable ownership/status endpoint hold session cleanup forever.
export async function pushFetch<T = Response>(input: RequestInfo | URL, init?: RequestInit, read?: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return read ? await read(response) : response as T;
  } finally {
    window.clearTimeout(timer);
  }
}
