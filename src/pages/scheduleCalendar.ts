/** Date-only plans: UTC arithmetic avoids DST shifting a business date. */
export function addDays(day: string, count: number): string {
    return new Date(Date.parse(`${day}T00:00:00Z`) + count * 86400000).toISOString().slice(0, 10);
}
export function monthRange(month: string) {
    const first = `${month}-01`;
    const d = new Date(`${first}T00:00:00Z`);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
    return { from: first, to: addDays(next, -1) };
}
export function changeMonth(month: string, delta: number): string {
    const d = new Date(`${month}-01T00:00:00Z`);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)).toISOString().slice(0, 7);
}
export function calendarDays(month: string): string[] {
    const { from, to } = monthRange(month);
    const start = addDays(from, -new Date(`${from}T00:00:00Z`).getUTCDay());
    const count = Math.ceil((Number(to.slice(-2)) + new Date(`${from}T00:00:00Z`).getUTCDay()) / 7) * 7;
    return Array.from({ length: count }, (_, i) => addDays(start, i));
}

/** Sunday–Saturday, matching the month calendar, including month/year edges. */
export function weekRange(day: string) {
    const from = addDays(day, -new Date(`${day}T00:00:00Z`).getUTCDay());
    return { from, to: addDays(from, 6) };
}
export function weekDays(day: string): string[] {
    const { from } = weekRange(day);
    return Array.from({ length: 7 }, (_, i) => addDays(from, i));
}
