import type { ShiftReport } from "../api/account";

type PaymentFields = Pick<ShiftReport, "paid_total" | "cash_total" | "card_total" | "other_total">;
type TicketCountFields = Pick<ShiftReport, "paid_total" | "guest_count" | "paid_count" | "cancelled_count">;

export type PaymentAllocation = {
    cash: number;
    card: number;
    other: number;
    unknown: number;
};

/**
 * Older imported shifts contain a reliable nightly revenue total but no
 * breakdown by payment method. Preserve the reported revenue and display the
 * difference separately rather than pretending it was "Other" or hiding it.
 *
 * If the recorded methods exceed the night's reported revenue, their split
 * cannot be reconciled. Show the night's revenue as unknown instead of
 * displaying an inflated bar or silently changing the reported total.
 */
export function paymentAllocation(shift: PaymentFields): PaymentAllocation {
    const revenue = Math.max(0, shift.paid_total);
    const cash = Math.max(0, shift.cash_total);
    const card = Math.max(0, shift.card_total);
    const other = Math.max(0, shift.other_total);
    const known = cash + card + other;
    if (known > revenue) {
        return { cash: 0, card: 0, other: 0, unknown: revenue };
    }
    return { cash, card, other, unknown: revenue - known };
}

/**
 * A closed historical night with sales/guests but zero recorded ticket counts
 * has no reliable number of tickets. The importer only stored guest_count,
 * which must never be treated as a number of tickets.
 *
 * We assume these unclassified historical tickets were paid, but their counts
 * remain unavailable until a real ticket count can be imported.
 */
export function ticketCountsUnavailable(shift: TicketCountFields): boolean {
    return shift.paid_count === 0 &&
        shift.cancelled_count === 0 &&
        (shift.paid_total > 0 || shift.guest_count > 0);
}
