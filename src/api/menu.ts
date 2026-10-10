// api/menu.ts

import type { MenuData, MenuItem, Prices } from "../types/Menu";
import { apiRequest } from "./client";

export function getMenu(): Promise<MenuData> {
    return apiRequest<MenuData>("/menu");
}

export function setMenuStock(itemId: number, inStock: boolean): Promise<MenuItem> {
    return apiRequest<MenuItem>(`/menu/items/${itemId}/stock`, {
        method: "PATCH",
        body: { in_stock: inStock },
    });
}

export function setMenuPrices(itemId: number, prices: Prices): Promise<MenuItem> {
    return apiRequest<MenuItem>(`/menu/items/${itemId}/prices`, {
        method: "PATCH",
        body: { prices },
    });
}
