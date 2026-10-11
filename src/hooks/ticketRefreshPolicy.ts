// Pure scheduling rules for cross-device ticket refreshes.
export const ACTIVE_REFRESH_MS = 10_000;
export const IDLE_REFRESH_MS = 60_000;
export const ACTIVE_WINDOW_MS = 30_000;

export function getTicketRefreshInterval(now: number, lastActivityAt: number): number {
  return now - lastActivityAt < ACTIVE_WINDOW_MS ? ACTIVE_REFRESH_MS : IDLE_REFRESH_MS;
}

export function isTicketRefreshDue(
  now: number,
  lastActivityAt: number,
  lastRefreshAt: number,
  visible: boolean,
): boolean {
  return visible && now - lastRefreshAt >= getTicketRefreshInterval(now, lastActivityAt);
}
