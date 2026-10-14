import type { Account, ShiftReport } from "../api/account";
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
    // Money already received stays revenue even if a paid tab is reopened.
    // Guest counting uses first-time guests, never ticket appearances.
    for (const ticket of shiftTickets.filter(ticket => ticket.status !== "cancelled")) {
        const actualPayments = ticket.payments?.filter(payment => typeof payment.amount === "number") ?? [];
        const ticketTotal = ticket.items.reduce((sum, item) => sum + item.subtotal, 0);
        const paidMoney = actualPayments.length
            ? actualPayments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0)
            : (ticket.status === "paid" ? ticketTotal : (ticket.amountPaid ?? 0));
        paidTotal += paidMoney;
        if (actualPayments.length) {
            for (const payment of actualPayments) {
                const amount = payment.amount ?? 0;
                if (payment.type === "cash") cashTotal += amount;
                else if (payment.type === "card") cardTotal += amount;
                else otherTotal += amount;
            }
        } else if (ticket.status === "paid") {
            const method = ticket.payment?.type ?? "other";
            if (method === "cash") cashTotal += paidMoney;
            else if (method === "card") cardTotal += paidMoney;
            else otherTotal += paidMoney;
        }
        if (ticket.status === "paid" || paidMoney > 0) {
            guestCount += Math.max(0, (ticket.guestCount ?? ticket.items.find(item => item.type === "cover")?.quantity ?? 0) - (ticket.returningGuestCount ?? 0));
            coverTotal += ticket.items.filter(item => item.type === "cover").reduce((sum, item) => sum + item.subtotal, 0);
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

export type OnDuty = { id: number; name: string; role: Account["role"] | null };

/** Compute who is actively clocked in using shift punches, without guessing roles. */
export function clockedInTeam(shift: ShiftReport, members: readonly Account[] | null): OnDuty[] {
    const roles = new Map<number, Account["role"]>(
        members?.map((member): [number, Account["role"]] => [member.id, member.role]) ?? [],
    );
    const onDuty = new Map<number, OnDuty>();
    for (const punch of shift.punches) {
        if (punch.clock_out !== null) {
            onDuty.delete(punch.user_id);
            continue;
        }
        onDuty.set(punch.user_id, {
            id: punch.user_id,
            name: punch.name,
            role: roles.get(punch.user_id) ?? null,
        });
    }
    return [...onDuty.values()].sort((a, b) =>
        (a.role === "manager" ? 0 : a.role === "staff" ? 1 : 2) -
        (b.role === "manager" ? 0 : b.role === "staff" ? 1 : 2) ||
        a.name.localeCompare(b.name),
    );
}
