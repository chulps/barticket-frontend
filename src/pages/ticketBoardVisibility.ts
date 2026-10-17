import type { Ticket } from "../types/Ticket";

export type ShiftLookup = {
  status: "loading" | "ready" | "error";
  shiftId: number | null;
};

/** Open tickets retain their all-shift recovery behavior. Closed tickets
 * require a positively confirmed active shift, including after failures. */
export function ticketVisibleOnBoard(
  ticket: Pick<Ticket, "status" | "shiftId">,
  tab: Ticket["status"],
  lookup: ShiftLookup,
): boolean {
  if (ticket.status !== tab) return false;
  if (tab === "open") return true;
  return lookup.status === "ready" &&
    lookup.shiftId !== null &&
    ticket.shiftId === lookup.shiftId;
}
