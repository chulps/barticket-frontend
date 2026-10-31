// Serialize browser subscription changes and session cleanup. A failed operation
// rejects its caller but must not prevent later sign-out cleanup from running.
let pending: Promise<unknown> = Promise.resolve();
export function serializePushOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = pending.then(operation, operation);
  pending = result.catch(() => undefined);
  return result;
}
