export type TicketItem = {
    id: number;

    type: "cover" | "menu";

    menu_item_id?: number;
    price_key?: string;

    name: string;

    unit_price: number;
    quantity: number;
    subtotal: number;
};

export type TicketStatus =
    | "open"
    | "closed";

export type Ticket = {
    id: number;

    name: string;
    status: TicketStatus;

    items: TicketItem[];

    created_at: number;
    updated_at: number;

    paid_at: number | null;
    cancelled_at: number | null;
};