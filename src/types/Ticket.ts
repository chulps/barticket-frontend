export type PaymentType = "cash" | "card" | "other";

export type Payment = {
  type: PaymentType;
  paid_at: number;
  reference?: string;
  refunded_at?: number | null;
};

export type Ticket = {
  id: number;
  name: string;

  status: "open" | "paid" | "cancelled";

  items: {
    id: number;
    type: "cover" | "menu";

    menu_item_id?: number;
    price_key?: string;

    name: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }[];

  created_at: number;
  updated_at: number;
  cancelled_at: number | null;

  payment: Payment | null;
};