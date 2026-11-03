export function claimReservationLink(ref: { current: object | null }, key: string): (() => void) | null;
export function reservationLinkFailure(error: unknown): "unavailable" | "retry";
export function runReservationLinkFlight<T>(options: { read: () => Promise<T>; isCurrent: () => boolean; onLoaded: (item: T) => Promise<void> | void; onFailure: (error: unknown) => void; onSettled: () => void }): () => void;
