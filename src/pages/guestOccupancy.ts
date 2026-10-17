import type { ShiftReport } from "../api/account";
import type { Ticket } from "../types/Ticket";

export type GuestOccupancyPoint = {
    at: number;
    firstTime: number;
    returning: number;
    total: number;
};

export type GuestOccupancyTimeline = {
    start: number;
    end: number;
    points: GuestOccupancyPoint[];
    firstTime: number;
    returning: number;
    current: number;
    peak: number;
};

type ShiftWindow = Pick<ShiftReport, "id" | "status" | "opened_at" | "closed_at" | "guest_count" | "paid_count" | "cancelled_count" | "paid_total">;

function seconds(value: number | null | undefined): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value > 100_000_000_000 ? value / 1000 : value;
}

function count(value: number | null | undefined): number {
    return value != null && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function closeTime(ticket: Ticket, shift: ShiftWindow, shiftEnd: number): number | null {
    if (ticket.status === "open") return shift.status === "open" ? null : shiftEnd;
    if (ticket.status === "cancelled") {
        return seconds(ticket.cancelled_at) ?? seconds(ticket.updated_at) ?? shiftEnd;
    }

    const activePayments = ticket.payments?.filter((payment) => payment.voided_at == null) ?? [];
    const latestActivePayment = activePayments.reduce<number | null>(
        (latest, payment) => {
            const at = seconds(payment.paid_at);
            return at == null ? latest : latest == null ? at : Math.max(latest, at);
        },
        null,
    );
    return latestActivePayment
        ?? seconds(ticket.payment?.paid_at)
        ?? seconds(ticket.updated_at)
        ?? shiftEnd;
}

/**
 * Estimate who is inside from each ticket's open-to-close interval.
 * Returning guests are a subset of the ticket's guest count.
 */
export function guestOccupancyTimeline(
    shift: ShiftWindow,
    tickets: readonly Ticket[],
    now: number,
): GuestOccupancyTimeline | null {
    const start = seconds(shift.opened_at);
    if (start == null) return null;

    const requestedEnd = shift.status === "closed"
        ? seconds(shift.closed_at) ?? seconds(now)
        : seconds(now);
    const end = Math.max(start + 60, requestedEnd ?? start + 60);
    const matching = tickets.filter((ticket) => ticket.shiftId === shift.id);

    // Imported historical nights can have guest totals without individual ticket timestamps.
    if (
        shift.status === "closed"
        && matching.length === 0
        && (count(shift.guest_count) > 0 || count(shift.paid_count) > 0 || count(shift.cancelled_count) > 0 || count(shift.paid_total) > 0)
    ) {
        return null;
    }

    const events = new Map<number, { firstTime: number; returning: number }>();
    const addEvent = (at: number, firstDelta: number, returningDelta: number) => {
        const current = events.get(at) ?? { firstTime: 0, returning: 0 };
        current.firstTime += firstDelta;
        current.returning += returningDelta;
        events.set(at, current);
    };

    for (const ticket of matching) {
        const rawStart = seconds(ticket.created_at);
        if (rawStart == null || rawStart > end) continue;
        const ticketStart = Math.max(start, rawStart);
        const ticketEnd = closeTime(ticket, shift, end);
        if (ticketEnd != null && ticketEnd <= ticketStart) continue;

        const guests = count(ticket.guestCount ?? ticket.items.find((item) => item.type === "cover")?.quantity);
        const returning = Math.min(guests, count(ticket.returningGuestCount));
        const firstTime = guests - returning;
        if (guests === 0) continue;

        addEvent(ticketStart, firstTime, returning);
        if (ticketEnd != null) {
            addEvent(Math.min(end, Math.max(ticketStart, ticketEnd)), -firstTime, -returning);
        }
    }

    const points: GuestOccupancyPoint[] = [{ at: start, firstTime: 0, returning: 0, total: 0 }];
    let firstTime = 0;
    let returning = 0;
    for (const [at, delta] of [...events.entries()].sort(([a], [b]) => a - b)) {
        firstTime = Math.max(0, firstTime + delta.firstTime);
        returning = Math.max(0, returning + delta.returning);
        points.push({ at, firstTime, returning, total: firstTime + returning });
    }
    const last = points[points.length - 1];
    if (last.at < end) points.push({ at: end, firstTime, returning, total: firstTime + returning });

    const peak = points.reduce((maximum, point) => Math.max(maximum, point.total), 0);
    return {
        start,
        end,
        points,
        firstTime,
        returning,
        current: firstTime + returning,
        peak,
    };
}
