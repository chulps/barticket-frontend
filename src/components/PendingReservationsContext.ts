import { createContext, useContext } from "react";
import type { PendingSnapshot } from "../api/pendingReservations";
export const empty: PendingSnapshot = { status: "checking", count: null, inbox: null, token: null, epoch: -1 };
export const PendingReservationsContext = createContext<{ snapshot: PendingSnapshot; retry: () => void; refresh: () => void; getSnapshot: () => PendingSnapshot; rejectAuthorization: (error: unknown, epoch: number) => boolean }>({ snapshot: empty, retry: () => {}, refresh: () => {}, getSnapshot: () => empty, rejectAuthorization: () => false });
export function usePendingReservations() { return useContext(PendingReservationsContext); }

export function createPendingStore() {
  let current: PendingSnapshot = empty;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    publish: (value: PendingSnapshot) => { current = value; listeners.forEach(listener => listener()); },
  };
}
