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
  coverAdjustedBy?: string | null;
  coverAdjustmentReason?: string | null;
  serverTotal?: number;
  serviceStatus?: "active" | "completed" | "cancelled";
  settlementStatus?: "not_due" | "outstanding" | "partially_paid" | "settled" | "written_off" | "cancelled";
  serviceBusinessDate?: string | null;
  unpaidReason?: string | null;
  unpaidNote?: string | null;
  followUpDate?: string | null;
  deferredAt?: number | null;
  deferredBy?: string | null;
  writtenOffAmount?: number;
  writeOffs?: { amount: number; reason: string; written_off_at: number; written_off_by: string }[];
  receivableHistory?: { type: string; amount: number | null; balance_after: number; reason: string | null; actor: string; created_at: number }[];
  payments?: {
    id?: number;
    type: PaymentType;
    amount: number;
    paid_at: number;
    collection_business_date?: string | null;
    collection_shift_id?: number | null;
    collected_by?: string | null;
    voided_at?: number | null;
    voided_by?: string | null;
    void_reason?: string | null;
    revenue_share_business_date?: string | null;
  }[];
};
