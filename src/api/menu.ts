// api/menu.ts

import type { MenuData } from "../types/Menu";
import { apiRequest } from "./client";

export function getMenu(): Promise<MenuData> {
    return apiRequest<MenuData>("/menu");
}
