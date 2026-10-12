/**
 * Forward messages from the service worker to the two existing refresh listeners.
 * Accept only BarTicket push messages; do not trust arbitrary worker messages.
 */
export function dispatchBarTicketPush(message: unknown, target: EventTarget): boolean {
  if (!message || typeof message !== "object" || !("type" in message) || message.type !== "barticket-push") return false;
  target.dispatchEvent(new Event("barticket-push"));
  target.dispatchEvent(new Event("barticket-notices"));
  return true;
}
