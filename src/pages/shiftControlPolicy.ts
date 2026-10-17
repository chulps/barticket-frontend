import type { ShiftReport } from "../api/account";
import type { ApiTicket } from "../api/tickets";

export type ShiftLookupStatus = "loading" | "ready" | "error";

/** Venue business day rolls at 12:00 Japan time, not at midnight. */
export function businessDateJst(nowMs: number): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
        day: "2-digit", hour: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(nowMs));
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
    const year = get("year"), month = get("month"), day = get("day"), hour = get("hour");
    return new Date(Date.UTC(year, month - 1, day - (hour < 12 ? 1 : 0))).toISOString().slice(0, 10);
}

export function currentPunch(shift: ShiftReport | null, userId: number) {
    return [...(shift?.punches ?? [])].reverse()
        .find(punch => punch.user_id === userId && punch.clock_out === null) ?? null;
}

/** Sum each punch, including multiple intervals in the same shift. */
export function workedSeconds(shift: ShiftReport | null, userId: number, nowSeconds: number): number {
    if (!shift) return 0;
    return shift.punches
        .filter(punch => punch.user_id === userId)
        .reduce((sum, punch) => sum + Math.max(0, (punch.clock_out ?? nowSeconds) - punch.clock_in), 0);
}

/** Existing backend blocks close for every open ticket (including old/unassigned).
 * Keep the client preview conservative until backend #87 adds scoped readiness. */
export function closeBlockers(tickets: readonly ApiTicket[]): ApiTicket[] {
    return tickets.filter(ticket => ticket.status === "open");
}

/** Compute read-only paid revenue estimates while a shift is still open.
 * The API persists final totals only on close. */
export function previewPaidTotals(tickets: readonly ApiTicket[], shiftId: number) {
    const totals = { paidTotal: 0, cash: 0, card: 0, other: 0, paidCount: 0 };
    for (const ticket of tickets) {
        if (ticket.shift_id !== shiftId || ticket.status !== "paid") continue;
        totals.paidTotal += ticket.total;
        totals.paidCount++;
        const method = ticket.payment?.type;
        if (method === "cash") totals.cash += ticket.total;
        else if (method === "card") totals.card += ticket.total;
        else totals.other += ticket.total;
    }
    return totals;
}

export function canManageShift(role: string): boolean {
    // Frontend guard for the proposed manager policy, not an API security boundary.
    return role === "manager";
}
