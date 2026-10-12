/**
 * Keep a background poll or push-triggered GET from replacing newer local
 * optimistic state. A response is valid only for the revision it started at,
 * and only while no local write is outstanding.
 */
export function acceptBackgroundSnapshot<T>(
  result: T,
  state: {
    startedRevision: number;
    currentRevision: number;
    pendingWrite: boolean;
    cancelled: boolean;
  },
): T | null {
  if (state.cancelled || state.pendingWrite || state.startedRevision !== state.currentRevision) return null;
  return result;
}
