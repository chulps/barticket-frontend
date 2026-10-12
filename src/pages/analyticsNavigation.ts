/**
 * Calendar stepping for the Analytics period navigator.
 *
 * Use UTC for date-only math so moving by a day doesn't skip or repeat dates
 * around daylight-saving transitions in the browser's local time zone.
 */
export function shiftYear(year: string, delta: number): string {
    return String(Number(year) + delta);
}

export function shiftMonth(key: string, delta: number): string {
    const [year, month] = key.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function shiftDay(iso: string, delta: number): string {
    const [year, month, day] = iso.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + delta));
    return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
