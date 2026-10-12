import type { MenuItem, Prices } from "../types/Menu";

export type SelectedDrink = {
    item: MenuItem;
    priceKey: keyof Prices;
    quantity: number;
};

export const FAVORITES_KEY = "barticket_quick_favorites_v1";
export const RECENT_KEY = "barticket_quick_recent_v1";
export const MAX_RECENT = 12;

export function readStoredIds(value: string | null): number[] {
    if (!value) return [];
    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];
        return [...new Set(parsed.filter((id): id is number => Number.isSafeInteger(id) && id > 0))].slice(0, 100);
    } catch {
        return [];
    }
}

export function toggleFavorite(favorites: number[], id: number): number[] {
    return favorites.includes(id) ? favorites.filter((value) => value !== id) : [...favorites, id];
}

export function recordRecent(recent: number[], ids: number[]): number[] {
    return [...new Set([...ids.filter((id) => Number.isSafeInteger(id) && id > 0).reverse(), ...recent])].slice(0, MAX_RECENT);
}

export function addSelection(selected: SelectedDrink[], item: MenuItem, priceKey: keyof Prices): SelectedDrink[] {
    if (item.inStock === false || item.category === "Cocktail Ingredients" || item.prices?.[priceKey] === undefined) return selected;
    const index = selected.findIndex((entry) => entry.item.id === item.id && entry.priceKey === priceKey);
    if (index === -1) return [...selected, { item, priceKey, quantity: 1 }];
    return selected.map((entry, i) => i === index
        ? { ...entry, quantity: Math.min(99, entry.quantity + 1) }
        : entry);
}

export function changeSelectionQuantity(selected: SelectedDrink[], itemId: number, priceKey: keyof Prices, change: number): SelectedDrink[] {
    return selected.flatMap((entry) => {
        if (entry.item.id !== itemId || entry.priceKey !== priceKey) return [entry];
        const quantity = Math.min(99, entry.quantity + change);
        return quantity < 1 ? [] : [{ ...entry, quantity }];
    });
}

export function quickEntryGroups(items: MenuItem[], favorites: number[], recent: number[]) {
    const sellable = items.filter((item) => item.category !== "Cocktail Ingredients");
    const favoritesSet = new Set(favorites);
    const recentSet = new Set(recent);
    const favoriteItems = sellable.filter((item) => favoritesSet.has(item.id));
    const recentItems = sellable.filter((item) => recentSet.has(item.id) && !favoritesSet.has(item.id));
    recentItems.sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id));
    return { favorites: favoriteItems, recent: recentItems, all: sellable };
}
