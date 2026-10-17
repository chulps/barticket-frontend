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

export type NewMenuItem = {
    name: string;
    category: string;
    subcategory?: string;
    description?: string;
    notes?: string;
    brand?: string;
    volume?: string;
    tags: string[];
    prices: Prices;
    in_stock: boolean;
    cocktail_ingredient: boolean;
};

export function createMenuItem(item: NewMenuItem): Promise<MenuItem> {
    return apiRequest<MenuItem>("/menu/items", {
        method: "POST",
        body: item,
    });
}

export function setMenuPrices(itemId: number, prices: Prices): Promise<MenuItem> {
    return apiRequest<MenuItem>(`/menu/items/${itemId}/prices`, {
        method: "PATCH",
        body: { prices },
    });
}



/** Backend #93: full Add Item-shaped edit; archived records retain ticket history. */
export type MenuItemEdit = NewMenuItem;

export function updateMenuItem(itemId: number, item: MenuItemEdit): Promise<MenuItem> {
    return apiRequest<MenuItem>(`/menu/items/${itemId}`, {
        method: "PATCH",
        body: item,
    });
}

export function getArchivedMenuItems(): Promise<{ items: MenuItem[] }> {
    return apiRequest<{ items: MenuItem[] }>("/menu/archived");
}

export function archiveMenuItem(itemId: number): Promise<MenuItem> {
    return apiRequest<MenuItem>(`/menu/items/${itemId}/archive`, { method: "POST" });
}

export function restoreMenuItem(itemId: number): Promise<MenuItem> {
    return apiRequest<MenuItem>(`/menu/items/${itemId}/restore`, { method: "POST" });
}
