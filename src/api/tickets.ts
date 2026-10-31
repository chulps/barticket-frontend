import { ticketListPath, type TicketReadScope } from "../hooks/ticketReadScope";
// api/tickets.ts

import type { PaymentType, Ticket } from "../types/Ticket";
import { apiRequest } from "./client";

// The cover charge is stored as guest_count on the backend; the UI shows it as a line.
export const COVER_ITEM_ID = 0;

type ApiTicketItem = {
    id: number;
    menu_item_id: number | null;
    staff_drink?: boolean;
    staff_name?: string;
    drink_name?: string;
    name: string;
    price_key: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    price_override?: boolean;
};

export type ApiTicket = {
    id: number;
    name: string;
    status: Ticket["status"];
    items: ApiTicketItem[];
    guest_count: number;
    cover_charge_per_person: number;
    cover_charge_total: number;
    waived_cover_count?: number;
    // Andrew's merged backend PR #91: audited cover/returning/payment history.
    returning_guest_count?: number;
    returning_from_ticket_id?: number | null;
    amount_paid?: number;
    balance_due?: number;
    payments?: NonNullable<Ticket["payments"]>;
    service_status?: Ticket["serviceStatus"];
    settlement_status?: Ticket["settlementStatus"];
    service_business_date?: string | null;
    unpaid_reason?: string | null;
    unpaid_note?: string | null;
    follow_up_date?: string | null;
    deferred_at?: number | null;
    deferred_by?: string | null;
    written_off_amount?: number;
    write_offs?: NonNullable<Ticket["writeOffs"]>;
    receivable_history?: NonNullable<Ticket["receivableHistory"]>;
    cover_adjusted_by?: string | null;
    cover_adjustment_reason?: string | null;
    total: number;
    created_at: number;
    paid_at: number | null;
    cancelled_at: number | null;
    created_by: string | null;
    shift_id: number | null;
    payment: { type: PaymentType; amount: number; paid_at: number } | null;
};

export function toTicket(api: ApiTicket): Ticket {
    const cover: Ticket["items"] =
        api.guest_count > 0
            ? [
                  {
                      id: COVER_ITEM_ID,
                      type: "cover",
                      name: "Cover Charge",
                      unit_price: api.cover_charge_per_person,
                      quantity: api.guest_count,
                      subtotal: api.cover_charge_total,
                  },
              ]
            : [];

    return {
        id: api.id,
        name: api.name,
        status: api.status,
        items: [
            ...cover,
            ...api.items.map((item) => ({
                id: item.id,
                type: "menu" as const,
                menu_item_id: item.menu_item_id,
                price_key: item.price_key,
                name: item.name,
                unit_price: item.unit_price,
                quantity: item.quantity,
                subtotal: item.subtotal,
                price_override: item.price_override ?? false,
                staff_drink: item.staff_drink,
                staff_name: item.staff_name,
                drink_name: item.drink_name,
            })),
        ],
        created_at: api.created_at,
        updated_at: api.cancelled_at ?? api.paid_at ?? api.created_at,
        cancelled_at: api.cancelled_at,
        created_by: api.created_by,
        shiftId: api.shift_id,
        payment: api.payment
            ? { type: api.payment.type, amount: api.payment.amount, paid_at: api.payment.paid_at }
            : null,
        serverTotal: api.total,
        coverAdjustedBy: api.cover_adjusted_by ?? null,
        coverAdjustmentReason: api.cover_adjustment_reason ?? null,
        guestCount: api.guest_count,
        waivedCoverCount: api.waived_cover_count ?? 0,
        coverChargePerPerson: api.cover_charge_per_person,
        returningGuestCount: api.returning_guest_count ?? 0,
        returningFromTicketId: api.returning_from_ticket_id ?? null,
        amountPaid: api.amount_paid,
        balanceDue: api.balance_due,
        payments: api.payments,
        serviceStatus: api.service_status,
        settlementStatus: api.settlement_status,
        serviceBusinessDate: api.service_business_date,
        unpaidReason: api.unpaid_reason,
        unpaidNote: api.unpaid_note,
        followUpDate: api.follow_up_date,
        deferredAt: api.deferred_at,
        deferredBy: api.deferred_by,
        writtenOffAmount: api.written_off_amount,
        writeOffs: api.write_offs,
        receivableHistory: api.receivable_history,
    };
}

export const ticketsApi = {
    list: (scope?: TicketReadScope) => apiRequest<ApiTicket[]>(ticketListPath(scope)),

    get: (ticketId: number) => apiRequest<ApiTicket>(`/tickets/${ticketId}`),

    emailReceipt: (ticketId: number, recipient: string, locale: "en" | "ja", idempotencyKey: string) =>
        apiRequest<{ status: "accepted"; delivery_id: number; replayed: boolean }>(`/tickets/${ticketId}/email-receipt`, {
            method: "POST",
            body: { recipient, locale },
            headers: { "Idempotency-Key": idempotencyKey },
        }),

    create: (guestCount = 1) =>
        apiRequest<ApiTicket>("/tickets", {
            method: "POST",
            body: { guest_count: guestCount },
        }),

    rename: (ticketId: number, name: string) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}`, {
            method: "PATCH",
            body: { name },
        }),

    /** Merged backend PR #91. All guests remain counted; adjustments are audited. */
    adjustCover: (ticketId: number, adjustment: {
        returning_guest_count: number;
        waived_cover_count: number;
        returning_from_ticket_id: number | null;
        reason: string;
    }) => apiRequest<ApiTicket>(`/tickets/${ticketId}/cover`, {
        method: "PATCH",
        body: adjustment,
    }),

    setGuests: (ticketId: number, guestCount: number) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/guests`, {
            method: "PATCH",
            body: { guest_count: guestCount },
        }),

    addItem: (ticketId: number, menuItemId: number, priceKey: string, quantity = 1) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/items`, {
            method: "POST",
            body: { menu_item_id: menuItemId, price_key: priceKey, quantity },
        }),

    addStaffDrink: (ticketId: number, staffId: number, menuItemId: number | null, priceKey: string, quantity: number) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/staff-drinks`, {
            method: "POST",
            body: { staff_id: staffId, menu_item_id: menuItemId, price_key: priceKey, quantity },
        }),

    updateItem: (
        ticketId: number,
        itemId: number,
        changes: { quantity?: number; unit_price?: number },
    ) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/items/${itemId}`, {
            method: "PATCH",
            body: changes,
        }),

    removeItem: (ticketId: number, itemId: number) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/items/${itemId}`, {
            method: "DELETE",
        }),

    pay: (ticketId: number, method: PaymentType, amount?: number, idempotencyKey?: string) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/pay`, {
            method: "POST",
            body: { method, ...(amount === undefined ? {} : { amount }) },
            ...(idempotencyKey ? { headers: { "Idempotency-Key": idempotencyKey } } : {}),
        }),

    receivables: (query = "") => apiRequest<{ items: ApiTicket[]; offset: number; limit: number; total: number }>(`/tickets/receivables${query}`),

    deferPayment: (ticketId: number, body: { reason: string; confirmed_balance: number; note?: string; follow_up_date?: string }) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/defer-payment`, { method: "POST", body }),

    writeOff: (ticketId: number, body: { amount: number; reason: string }, idempotencyKey: string) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/write-off`, {
            method: "POST", body, headers: { "Idempotency-Key": idempotencyKey },
        }),

    voidPayment: (ticketId: number, paymentId: number, reason: string) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/payments/${paymentId}/void`, { method: "POST", body: { reason } }),

    cancel: (ticketId: number) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/cancel`, { method: "POST" }),

    reopen: (ticketId: number, reason: "customer_returned" | "closed_by_mistake" = "customer_returned") =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/reopen`, {
            method: "POST", body: { reason },
        }),
};

