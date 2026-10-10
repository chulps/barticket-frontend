export type Prices = {
    standard?: number;
    "15ml"?: number;
    "30ml"?: number;
};


export type MenuItem = {
    id: number;

    inStock?: boolean;

    category: string;
    subcategory?: string;

    name: string;
    brand?: string;
    volume?: string;

    description?: string;
    notes?: string;

    prices: Prices;

    cocktailIngredient?: boolean;

    tags?: string[];
};


export type MenuData = {
    coverCharge: number;
    items: MenuItem[];
};