import type { Ticket } from "../types/Ticket";
export type SalesKind = "menu" | "staff" | "cover";
export type ItemSale = { id: string; name: string; kind: SalesKind; quantity: number; revenue: number; variants: { label: string; unitPrice: number; quantity: number; revenue: number }[] };
export function itemSales(tickets: readonly Ticket[]) {
    const rows = new Map<string, ItemSale>();
    const staff = new Map<string, { id: string; name: string; attributed: boolean; quantity: number; revenue: number }>();
    let excludedTickets = 0, invalidLines = 0;
    for (const ticket of tickets) {
        if (ticket.status !== "paid" || ticket.payment?.refunded_at != null ||
            (ticket.balanceDue ?? 0) > 0 || (ticket.writtenOffAmount ?? 0) > 0 ||
            ["written_off", "partially_paid", "outstanding", "cancelled"].includes(ticket.settlementStatus ?? "")) { excludedTickets++; continue; }
        for (const line of ticket.items) {
            if (!Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.subtotal) || line.subtotal < 0 || !Number.isFinite(line.unit_price)) { invalidLines++; continue; }
            const kind: SalesKind = line.type === "cover" ? "cover" : line.staff_drink ? "staff" : "menu";
            const quantity = kind === "cover"
                ? Math.max(0, (ticket.guestCount ?? line.quantity) - (ticket.returningGuestCount ?? 0) - (ticket.waivedCoverCount ?? 0))
                : line.quantity;
            if (kind === "staff") {
                const attributed = line.staff_id != null;
                const staffKey = attributed ? `staff:${line.staff_id}` : "unattributed";
                const person = staff.get(staffKey) ?? { id: staffKey, name: attributed ? (line.staff_name || `Staff #${line.staff_id}`) : "Unattributed", attributed, quantity: 0, revenue: 0 };
                person.quantity += quantity; person.revenue += line.subtotal;
                staff.set(staffKey, person);
            }
            const name = kind === "staff" ? (line.drink_name || "Staff drink") : line.name;
            const id = kind === "cover" ? "cover" : `${kind}:${line.menu_item_id == null ? `name:${name.trim().toLowerCase()}` : `id:${line.menu_item_id}`}`;
            const row = rows.get(id) ?? { id, name, kind, quantity: 0, revenue: 0, variants: [] };
            row.quantity += quantity; row.revenue += line.subtotal;
            const label = line.price_key || "standard";
            const variant = row.variants.find(v => v.label === label && v.unitPrice === line.unit_price);
            if (variant) { variant.quantity += quantity; variant.revenue += line.subtotal; }
            else row.variants.push({ label, unitPrice: line.unit_price, quantity, revenue: line.subtotal });
            rows.set(id, row);
        }
    }
    const items = [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.quantity - a.quantity || a.id.localeCompare(b.id));
    const revenue = items.reduce((sum, row) => sum + row.revenue, 0);
    return { items, revenue, excludedTickets, invalidLines, staff: [...staff.values()].sort((a,b)=>b.revenue-a.revenue || a.id.localeCompare(b.id)),
        breakdown: (["menu", "staff", "cover"] as const).map(kind => ({ kind, revenue: items.filter(r => r.kind === kind).reduce((n, r) => n + r.revenue, 0) })) };
}
export function saleShare(amount: number, total: number) { return total > 0 ? amount / total * 100 : 0; }
/** API date scope also includes collections of older tickets. Filter service dates again. */
export function servicePeriod(tickets: readonly Ticket[], from: string, to: string, shiftDates: ReadonlyMap<number, string>) {
    let unknownDates = 0;
    const rows = tickets.filter(ticket => {
        const date = ticket.serviceBusinessDate || (ticket.shiftId === null ? undefined : shiftDates.get(ticket.shiftId));
        if (!date) { unknownDates++; return false; }
        return date >= from && date <= to;
    });
    return { rows, unknownDates };
}

export function validSalesRange(from: string, to: string) {
    const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end) && end >= start && (end-start)/86400000 < 366;
}
