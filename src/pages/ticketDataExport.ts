import type { Ticket } from "../types/Ticket";

function ticketRecord(ticket: Ticket, businessDate: string | null) {
    const cover = ticket.items.find((item) => item.type === "cover");
    return {
        ticket_id: ticket.id,
        business_date: businessDate,
        shift_id: ticket.shiftId,
        name: ticket.name || null,
        status: ticket.status,
        created_at: ticket.created_at,
        paid_at: ticket.payment?.paid_at ?? null,
        cancelled_at: ticket.cancelled_at,
        created_by: ticket.created_by,
        guest_count: ticket.guestCount ?? cover?.quantity ?? 0,
        returning_guest_count: ticket.returningGuestCount ?? 0,
        returning_from_ticket_id: ticket.returningFromTicketId ?? null,
        waived_cover_count: ticket.waivedCoverCount ?? 0,
        cover_charge_per_person: ticket.coverChargePerPerson ?? cover?.unit_price ?? null,
        cover_charge_total: cover?.subtotal ?? null,
        payment: ticket.payment,
        payments: ticket.payments ?? [],
        amount_paid: ticket.amountPaid ?? null,
        balance_due: ticket.balanceDue ?? null,
        total: ticket.serverTotal ?? ticket.items.reduce((sum, item) => sum + item.subtotal, 0),
        items: ticket.items.map((item) => ({
            id: item.id,
            type: item.type,
            menu_item_id: item.menu_item_id ?? null,
            name: item.name,
            price_key: item.price_key ?? null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            subtotal: item.subtotal,
            staff_drink: item.staff_drink ?? false,
            staff_name: item.staff_name ?? null,
            drink_name: item.drink_name ?? null,
        })),
    };
}

export function ticketDataForClipboard(ticket: Ticket, businessDate: string | null) {
    return ticketRecord(ticket, businessDate);
}

export function ticketListDataForClipboard(tickets: readonly Ticket[], dates: ReadonlyMap<number, string>) {
    return {
        ticket_count: tickets.length,
        tickets: tickets.map((ticket) => ticketRecord(ticket, dates.get(ticket.shiftId ?? 0) ?? null)),
    };
}
