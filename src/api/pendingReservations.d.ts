import type { ReservationInbox } from "./reservations";
type Status = 'checking' | 'anonymous' | 'staff' | 'loading' | 'ready' | 'error' | 'role-error';
export type PendingSnapshot = { status: Status; count: number | null; inbox: ReservationInbox | null; token: string | null; epoch: number };
export function createPendingReservations(options: { getToken: () => string | null; getViewer: () => Promise<{ role: string }>; getInbox: () => Promise<ReservationInbox>; publish: (snapshot: PendingSnapshot) => void }): { authorize: (force?: boolean) => Promise<void>; refresh: () => Promise<void>; rejectAuthorization: (error: unknown, epoch: number) => boolean; stop: () => void };

export function isCurrentReservationManager(snapshot: PendingSnapshot, token: string | null, epoch: number): boolean;
