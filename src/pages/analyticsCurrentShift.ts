import type { ShiftReport } from "../api/account";
import type { Ticket } from "../types/Ticket";

/** Default to the active business night, otherwise the most recently closed night. */
export function initialAnalyticsShift(
    openShift: ShiftReport | null,
    closedShifts: readonly ShiftReport[],
): ShiftReport | null {
    if (openShift) return openShift;
    return closedShifts.reduce<ShiftReport | null>(
        (latest, shift) => !latest || shift.business_date > latest.business_date ? shift : latest,
        null,
    );
}

/** The Daily picker must be able to find the open night as well as archived nights. */
export function analyticsShiftOnDate(
    date: string,
    openShift: ShiftReport | null,
    closedShifts: readonly ShiftReport[],
): ShiftReport | null {
    if (openShift?.business_date === date) return openShift;
    return closedShifts.find((shift) => shift.business_date === date) ?? null;
}

/**
 * The API saves revenue and ticket-status totals on shift close.
 * While a shift is open, derive a read-only snapshot from the already loaded
 * tickets. Only paid tickets contribute to revenue/guests; cancelled tickets
 * count only toward the cancelled count. Open/unpaid tickets are excluded.
 */
export function liveAnalyticsShift(
    openShift: ShiftReport | null,
    tickets: readonly Ticket[],
): ShiftReport | null {
    if (!openShift || openShift.status !== "open") return openShift;
    const shiftTickets = tickets.filter((ticket) => ticket.shiftId === openShift.id);
    const paid = shiftTickets.filter((ticket) => ticket.status === "paid");
    const cancelledCount = shiftTickets.filter((ticket) => ticket.status === "cancelled").length;
    let paidTotal = 0;
    let cashTotal = 0;
    let cardTotal = 0;
    let otherTotal = 0;
    let coverTotal = 0;
    let guestCount = 0;
    for (const ticket of paid) {
        const total = ticket.items.reduce((sum, item) => sum + item.subtotal, 0);
        paidTotal += total;
        const method = ticket.payment?.type ?? "other";
        if (method === "cash") cashTotal += total;
        else if (method === "card") cardTotal += total;
        else otherTotal += total;

        for (const item of ticket.items) {
            if (item.type !== "cover") continue;
            guestCount += item.quantity;
            coverTotal += item.subtotal;
        }
    }
    return {
        ...openShift,
        paid_total: paidTotal,
        cash_total: cashTotal,
        card_total: cardTotal,
        other_total: otherTotal,
        cover_total: coverTotal,
        guest_count: guestCount,
        paid_count: paid.length,
        cancelled_count: cancelledCount,
    };
}
