import type { MenuItem, Prices } from "../types/Menu";

export type SelectedDrink = {
    item: MenuItem;
    priceKey: keyof Prices;
    quantity: number;
};

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
