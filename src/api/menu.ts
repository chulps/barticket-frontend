// api/menu.ts

import type { MenuData } from "../types/Menu";

export async function getMenu(): Promise<MenuData> {
    const res = await fetch("http://127.0.0.1:8000/menu");

    if (!res.ok) {
        throw new Error("Failed to load menu");
    }

    return res.json();
}