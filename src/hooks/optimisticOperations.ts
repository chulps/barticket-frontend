import type { MenuData, MenuItem, Prices } from "../types/Menu";
import type { NoticeList } from "../api/notices";
import type { Ticket } from "../types/Ticket";

// Pure state transitions shared by the UI and regression tests.
export function replaceMenuItem(menu: MenuData, updated: MenuItem): MenuData {
  return { ...menu, items: menu.items.map(item =>
    item.id === updated.id ? { ...item, ...updated } : item) };
}

export function optimisticStock(item: MenuItem): MenuItem {
  return { ...item, inStock: item.inStock === false };
}

export function optimisticPrices(item: MenuItem, prices: Prices): MenuItem {
  return { ...item, prices };
}

export function reconcileMenuSnapshot(
  incoming: MenuData, visible: MenuData | null, pendingItemIds: ReadonlySet<number>,
): MenuData {
  if (!visible || pendingItemIds.size === 0) return incoming;
  return { ...incoming, items: incoming.items.map(item =>
    pendingItemIds.has(item.id)
      ? visible.items.find(existing => existing.id === item.id) ?? item
      : item) };
}

export function dismissRestockNotice(list: NoticeList, id: number): NoticeList {
  return { ...list, notices: list.notices.filter(notice => notice.id !== id) };
}

export function provisionalTicket(id: number, now: number): Ticket {
  return {
    id, name: "Creating ticket…", status: "open", items: [], created_at: now,
    updated_at: now, cancelled_at: null, created_by: null, shiftId: null, payment: null,
  };
}

export function resolveProvisionalTicket(tickets: Ticket[], provisionalId: number, confirmed: Ticket): Ticket[] {
  return tickets.map(ticket => ticket.id === provisionalId ? confirmed : ticket);
}

export function removeProvisionalTicket(tickets: Ticket[], provisionalId: number): Ticket[] {
  return tickets.filter(ticket => ticket.id !== provisionalId);
}
