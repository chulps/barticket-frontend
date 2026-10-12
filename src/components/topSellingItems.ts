import type { Ticket } from "../types/Ticket";

export type SellingItem = {
  id: string;
  name: string;
  menuItemId: number | null;
  quantity: number;
  revenue: number;
};

/**
 * Rank paid menu items by units sold across the selected closed shifts.
 * Sizes/price variants of a menu item count together; staff drinks and cover
 * charges are excluded. Items without a menu ID use their recorded name.
 */
export function topSellingItems(tickets: Ticket[], shiftIds: ReadonlySet<number>, limit = 3): SellingItem[] {
  const rows = new Map<string, SellingItem>();
  for (const ticket of tickets) {
    if (ticket.status !== "paid" || ticket.shiftId === null || !shiftIds.has(ticket.shiftId)) continue;
    for (const item of ticket.items) {
      if (item.type !== "menu" || item.staff_drink || !Number.isFinite(item.quantity) ||
          item.quantity <= 0 || !Number.isFinite(item.subtotal)) continue;
      const menuItemId = item.menu_item_id ?? null;
      const key = menuItemId === null ? `name:${item.name.trim().toLocaleLowerCase()}` : `menu:${menuItemId}`;
      const current = rows.get(key);
      if (current) {
        current.quantity += item.quantity;
        current.revenue += item.subtotal;
      } else {
        rows.set(key, { id: key, menuItemId, name: item.name, quantity: item.quantity, revenue: item.subtotal });
      }
    }
  }
  return [...rows.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, limit));
}
