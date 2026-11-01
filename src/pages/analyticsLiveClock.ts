import type { ShiftReport } from "../api/account";

/** Advance only open-shift display hours using the API's effective punch times. */
export function withLiveShiftHours(shift: ShiftReport | null, now: number | null): ShiftReport | null {
    if (!shift || shift.status !== "open" || now === null) return shift;
    const seconds = new Map<number, number>();
    for (const punch of shift.punches) {
        const elapsed = Math.max(0, (punch.clock_out ?? now) - punch.clock_in);
        seconds.set(punch.user_id, (seconds.get(punch.user_id) ?? 0) + elapsed);
    }
    return { ...shift, staff_hours: shift.staff_hours.map(person => ({
        ...person, seconds: seconds.get(person.user_id) ?? person.seconds,
    })) };
}
