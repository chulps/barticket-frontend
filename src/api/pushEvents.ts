/**
 * Forward messages from the service worker to the two existing refresh listeners.
 * Accept only BarTicket push messages; do not trust arbitrary worker messages.
 */
export function dispatchBarTicketPush(message: unknown, target: EventTarget): boolean {
  if (!message || typeof message !== "object" || !("type" in message) || message.type !== "barticket-push") return false;
  const hint = message as { eventType?: unknown; ticketId?: unknown };
  target.dispatchEvent(new CustomEvent("barticket-push", { detail: { eventType: hint.eventType, ticketId: hint.ticketId } }));
  target.dispatchEvent(new Event("barticket-notices"));
  return true;
}

