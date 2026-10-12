import type { MenuItem } from "../types/Menu";
import type { Ticket } from "../types/Ticket";

export const POPULAR_WINDOW_DAYS = 30;

/**
 * Top selling menu items on paid tickets in the last 30 days, ranked by units sold.
 * Staff drinks, covers, cancelled/open tickets, and unavailable menu items do not count.
 * A paid ticket's payment timestamp is in Unix seconds.
 */
export function topSellingDrinks(
    tickets: Ticket[],
    menuItems: MenuItem[],
    nowMs: number = Date.now(),
    limit = 3,
): MenuItem[] {
    const cutoff = Math.floor((nowMs - POPULAR_WINDOW_DAYS * 24 * 60 * 60 * 1000) / 1000);
    const counts = new Map<number, number>();
    const eligible = new Map(
        menuItems
            .filter((item) =>
                item.inStock !== false &&
                item.category !== "Cocktail Ingredients" &&
                Object.values(item.prices).some((price) => typeof price === "number"),
            )
            .map((item) => [item.id, item]),
    );

    for (const ticket of tickets) {
        if (ticket.status !== "paid" || !ticket.payment || ticket.payment.paid_at < cutoff ||
            ticket.payment.paid_at > Math.floor(nowMs / 1000)) continue;

        for (const line of ticket.items) {
            const id = line.menu_item_id;
            if (line.type !== "menu" || line.staff_drink || id == null || !eligible.has(id) ||
                !Number.isSafeInteger(line.quantity) || line.quantity <= 0) continue;
            counts.set(id, (counts.get(id) ?? 0) + line.quantity);
        }
    }

    return [...counts.entries()]
        .sort(([idA, countA], [idB, countB]) => countB - countA || idA - idB)
        .slice(0, Math.max(0, limit))
        .map(([id]) => eligible.get(id)!);
}
