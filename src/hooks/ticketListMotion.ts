import type { Ticket } from '../types/Ticket';
export type TicketMove = { id: number; from: Ticket['status'] | null; to: Ticket['status'] };
export type TicketListMotion = { sequence: number; source: 'initial' | 'live' | 'quiet' | 'local'; moves: TicketMove[] };

/** Compare accepted server states, never display filters or optimistic status. */
export function ticketLifecycleMoves(before: readonly Ticket[], after: readonly Ticket[]): TicketMove[] {
  const previous = new Map(before.filter(row => Number.isSafeInteger(row.id) && row.id > 0).map(row => [row.id, row]));
  return after.flatMap<TicketMove>(row => {
    if (!Number.isSafeInteger(row.id) || row.id <= 0) return [];
    const old = previous.get(row.id);
    if (!old) return row.status === 'open' ? [{ id: row.id, from: null, to: row.status }] : [];
    return old.status !== row.status ? [{ id: row.id, from: old.status, to: row.status }] : [];
  });
}

/** A foreground push is live only with the server's fresh, deduplicated envelope. */
export function freshTicketMotionEvent(detail: unknown, now: number, armedAt: number): string | null {
  if (!detail || typeof detail !== 'object') return null;
  const event = detail as { eventId?: unknown; eventType?: unknown; ticketId?: unknown; occurredAt?: unknown };
  if (typeof event.eventId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.eventId)) return null;
  if (!Number.isSafeInteger(event.ticketId) || (event.ticketId as number) <= 0) return null;
  if (!['ticket_created', 'ticket_updated', 'ticket_paid', 'ticket_cancelled', 'ticket_reopened', 'ticket_payment_recorded', 'ticket_closed', 'ticket_payment_deferred'].includes(String(event.eventType))) return null;
  if (typeof event.occurredAt !== 'number' || !Number.isFinite(event.occurredAt)) return null;
  const at = event.occurredAt * 1000;
  return at >= armedAt && at <= now + 1000 && now - at <= 15000 ? event.eventId : null;
}
