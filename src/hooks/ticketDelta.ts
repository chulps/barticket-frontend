import type { Ticket } from "../types/Ticket";

/** Only a supported, positive-ID hint may narrow a read. REST still authorizes it. */
export function ticketInvalidationId(detail: unknown): number | null {
    if (!detail || typeof detail !== "object") return null;
    const hint = detail as {ticketId?: unknown; eventType?: unknown};
    if (!["ticket_created", "ticket_updated", "ticket_paid", "ticket_cancelled", "ticket_reopened"].includes(String(hint.eventType))) return null;
    return typeof hint.ticketId === "number" && Number.isSafeInteger(hint.ticketId) && hint.ticketId > 0 ? hint.ticketId : null;
}

/** Authoritative ID reads remove deleted or moved records, never append duplicates. */
export function mergeTicketDelta(existing: readonly Ticket[], ids: readonly number[], replacements: readonly Ticket[], shiftId: number | null): Ticket[] {
    const changed = new Set(ids);
    const keep = (ticket: Ticket) => ticket.status === "open" || (shiftId !== null && (ticket.shiftId === shiftId ||
        ticket.payments?.some(payment => payment.collection_shift_id === shiftId)));
    return [...existing.filter(ticket => !changed.has(ticket.id)), ...replacements.filter(keep)]
        .sort((a,b) => b.id - a.id);
}
