import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { accountApi } from "../api/account";
import { getToken } from "../api/client";
import { shouldPoll } from "../api/realtime";
import { reservationsApi } from "../api/reservations";
import { createPendingReservations } from "../api/pendingReservations";

import { createPendingStore, empty, PendingReservationsContext } from "./PendingReservationsContext";

export function PendingReservationsProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createPendingStore(), []);
  const snapshot = useSyncExternalStore(store.subscribe, store.get, () => empty);
  const getSnapshot = useCallback(() => { const current = store.get(); return current.token === getToken() ? current : empty; }, [store]);
  const retryRef = useRef<() => void>(() => {});
  const retry = useCallback(() => retryRef.current(), []);
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
  const rejectRef = useRef<(error: unknown, epoch: number) => boolean>(() => false);
  const rejectAuthorization = useCallback((error: unknown, epoch: number) => rejectRef.current(error, epoch), []);
  useEffect(() => {
    const controller = createPendingReservations({ getToken, getViewer: accountApi.me, getInbox: reservationsApi.inbox, publish: store.publish });
    const authorize = () => { void controller.authorize(); };
    const authorizeExplicitly = () => { void controller.authorize(true); };
    const refresh = () => { void controller.refresh(); };
    const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === "barticket_token") authorizeExplicitly(); };
    retryRef.current = authorizeExplicitly;
    refreshRef.current = refresh;
    rejectRef.current = controller.rejectAuthorization;
    authorize();
    const timer = window.setInterval(() => { if (shouldPoll()) authorize(); }, 20000);
    window.addEventListener("barticket-auth", authorizeExplicitly);
    window.addEventListener("barticket-users-updated", authorize);
    window.addEventListener("barticket-reservations-updated", refresh);
    window.addEventListener("barticket-api-restored", authorize);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", authorize);
    return () => {
      controller.stop(); window.clearInterval(timer);
      window.removeEventListener("barticket-auth", authorizeExplicitly);
      window.removeEventListener("barticket-users-updated", authorize);
      window.removeEventListener("barticket-reservations-updated", refresh);
      window.removeEventListener("barticket-api-restored", authorize);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", authorize);
    };
  }, [store]);
  // A token may change before the auth event is processed or React rerenders.
  const safe = snapshot.token === getToken() ? snapshot : empty;
  return <PendingReservationsContext.Provider value={{ snapshot: safe, retry, refresh, getSnapshot, rejectAuthorization }}>{children}</PendingReservationsContext.Provider>;
}
