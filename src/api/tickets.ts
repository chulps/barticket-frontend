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
    // Future backend returning-customer and payment-history contract.
    returning_guest_count?: number;
    returning_from_ticket_id?: number | null;
    amount_paid?: number;
    balance_due?: number;
    payments?: { type: PaymentType; amount: number; paid_at: number }[];
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
            ? { type: api.payment.type, paid_at: api.payment.paid_at }
            : null,
        guestCount: api.guest_count,
        waivedCoverCount: api.waived_cover_count ?? 0,
        coverChargePerPerson: api.cover_charge_per_person,
        returningGuestCount: api.returning_guest_count ?? 0,
        returningFromTicketId: api.returning_from_ticket_id ?? null,
        amountPaid: api.amount_paid,
        balanceDue: api.balance_due,
        payments: api.payments,
    };
}

export const ticketsApi = {
    list: () => apiRequest<ApiTicket[]>("/tickets"),

    get: (ticketId: number) => apiRequest<ApiTicket>(`/tickets/${ticketId}`),

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

    /** Backend PR #92. Preserve guest_count and only change billable covers. */
    setCoverWaivers: (ticketId: number, waivedCoverCount: number) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/cover-waivers`, {
            method: "PATCH",
            body: { waived_cover_count: waivedCoverCount },
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

    pay: (ticketId: number, method: PaymentType) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/pay`, {
            method: "POST",
            body: { method },
        }),

    cancel: (ticketId: number) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/cancel`, { method: "POST" }),

    reopen: (ticketId: number) =>
        apiRequest<ApiTicket>(`/tickets/${ticketId}/reopen`, { method: "POST" }),
};
