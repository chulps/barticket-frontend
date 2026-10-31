import type { Ticket } from "../types/Ticket";

export type TicketAction = "created" | "paid" | "cancelled" | "reopened";
export type TicketActionCue = TicketAction | "payment-recorded";
export type TicketActionFeedback = { sequence: number; ticketId: number; cue: TicketActionCue };

/** Only call with the direct, successful mutation response. Never infer lifecycle
 * events from loaded history, invalidations, optimistic rows or reconciliation. */
export function confirmedTicketCue(action: TicketAction, saved: Ticket | null): TicketActionCue | null {
  if (!saved || !Number.isSafeInteger(saved.id) || saved.id <= 0) return null;
  if (action === "created" || action === "reopened") return saved.status === "open" ? action : null;
  if (action === "cancelled") return saved.status === "cancelled" ? action : null;
  if (saved.status === "cancelled") return null;
  // Partial collections and service-only closure must never celebrate settlement.
  if (saved.status !== "paid" || (saved.balanceDue ?? 0) > 0 ||
      (saved.settlementStatus !== undefined && saved.settlementStatus !== "settled")) return "payment-recorded";
  return "paid";
}
