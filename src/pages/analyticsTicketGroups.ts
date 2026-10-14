import type { Ticket } from "../types/Ticket";

/**
 * Preserve the original chronological ticket history, but present completed
 * sales and cancelled tickets in separate groups for the selected shifts.
 *
 * Grouping only: never alter statuses, recorded values, or ticket order
 * within each status.
 */
export function groupAnalyticsTickets(
    tickets: readonly Ticket[],
    shiftDates: ReadonlyMap<number, string>,
): { paid: Ticket[]; cancelled: Ticket[] } {
    const matching = tickets
        .filter((ticket) => ticket.shiftId !== null
            && shiftDates.has(ticket.shiftId)
            && (ticket.status === "paid" || ticket.status === "cancelled"))
        .sort((a, b) => {
            const byDate = (shiftDates.get(a.shiftId ?? 0) ?? "").localeCompare(
                shiftDates.get(b.shiftId ?? 0) ?? "",
            );
            return byDate || a.id - b.id;
        });

    return {
        paid: matching.filter((ticket) => ticket.status === "paid"),
        cancelled: matching.filter((ticket) => ticket.status === "cancelled"),
    };
}
