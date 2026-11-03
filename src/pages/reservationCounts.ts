import type { Reservation } from "../api/reservations";

// Keep canceled and declined requests visible as history, but do not count them
// as pending or approved bookings.
export function reservationCounts(items: Pick<Reservation, "status">[]) {
    return {
        pending: items.filter(item => item.status === "pending").length,
        approved: items.filter(item => item.status === "approved").length,
        history: items.filter(item => item.status === "declined" || item.status === "canceled").length,
    };
}
