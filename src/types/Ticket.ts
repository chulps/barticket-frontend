export type PaymentType = "cash" | "card" | "other";

export type Payment = {
  type: PaymentType;
  paid_at: number;
  reference?: string;
  refunded_at?: number | null;
  amount?: number;
};

export type Ticket = {
  id: number;
  name: string;

  status: "open" | "paid" | "cancelled";

  items: {
    id: number;
    type: "cover" | "menu";

    menu_item_id?: number | null;
    staff_drink?: boolean;
    staff_name?: string;
    drink_name?: string;
    price_key?: string;
    price_override?: boolean;

    name: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }[];

  created_at: number;
  updated_at: number;
  cancelled_at: number | null;
  created_by: string | null;
  shiftId: number | null;

  payment: Payment | null;
  guestCount?: number;
  waivedCoverCount?: number;
  coverChargePerPerson?: number;
  // The merged backend #91 supplies historical payments and return references.
  returningGuestCount?: number;
  returningFromTicketId?: number | null;
  amountPaid?: number;
  balanceDue?: number;
  payments?: { type: PaymentType; amount: number; paid_at: number; voided_at?: number | null; voided_by?: string | null }[];
  coverAdjustedBy?: string | null;
  coverAdjustmentReason?: string | null;
  serverTotal?: number;
};
