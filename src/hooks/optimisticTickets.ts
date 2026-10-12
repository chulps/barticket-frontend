import type { Ticket } from "../types/Ticket";

export type OptimisticEdit = {
  key: number;
  transform: (ticket: Ticket) => Ticket;
};

// The latest authoritative ticket is the base. Unconfirmed local actions are
// replayed in click order; settling one must never erase another.
export function projectTicket(ticket: Ticket, pending: OptimisticEdit[]): Ticket {
  return pending.reduce((current, edit) => edit.transform(current), ticket);
}
