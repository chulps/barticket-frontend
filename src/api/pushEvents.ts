/**
 * Forward messages from the service worker to the two existing refresh listeners.
 * Accept only BarTicket push messages; do not trust arbitrary worker messages.
 */
export function dispatchBarTicketPush(message: unknown, target: EventTarget): boolean {
  if (!message || typeof message !== "object" || !("type" in message) || message.type !== "barticket-push") return false;
  const hint = message as { eventType?: unknown; ticketId?: unknown; eventId?: unknown; occurredAt?: unknown; soundCue?: unknown };
  target.dispatchEvent(new CustomEvent("barticket-push", { detail: { eventType: hint.eventType, ticketId: hint.ticketId, eventId: hint.eventId, occurredAt: hint.occurredAt, soundCue: hint.soundCue } }));
  target.dispatchEvent(new Event("barticket-notices"));
  return true;
}


