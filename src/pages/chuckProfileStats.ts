import type { AnalyticsShiftReport, ServiceSalesReport } from "../api/account";

export type ChuckProfileNight = {
    businessDate: string;
    shiftId: number;
    billedSalesYen: number | null;
    guests: number;
};

export type ChuckProfileStats = {
    nights: ChuckProfileNight[];
    unassignedManagerDays: number;
    ambiguousManagerDays: number;
};

/** Join manager assignments and service-date sales; use the recorded shift total when ticket detail is absent. */
export function buildChuckProfileStats(
    shifts: AnalyticsShiftReport[],
    serviceSales: ServiceSalesReport,
    userId: number,
    month: string,
): ChuckProfileStats {
    const days = new Map<string, AnalyticsShiftReport[]>();
    for (const shift of shifts) {
        if (shift.status !== "closed" || shift.id === null || !shift.business_date.startsWith(month)) continue;
        const rows = days.get(shift.business_date) ?? [];
        rows.push(shift);
        days.set(shift.business_date, rows);
    }

    const salesByDate = new Map(serviceSales.items.map(item => [item.business_date, item]));
    const result: ChuckProfileStats = { nights: [], unassignedManagerDays: 0, ambiguousManagerDays: 0 };
    for (const [businessDate, dayShifts] of days) {
        const managers = new Set(dayShifts.map(shift => shift.working_manager_user_id ?? null));
        if (managers.size !== 1) {
            result.ambiguousManagerDays += 1;
            continue;
        }
        if (managers.has(null)) {
            result.unassignedManagerDays += 1;
            continue;
        }
        if (!managers.has(userId)) continue;

        // The venue has one shift per business date. If malformed data contains
        // more than one same-manager shift, do not duplicate the date-level sales.
        if (dayShifts.length !== 1) {
            result.ambiguousManagerDays += 1;
            continue;
        }
        const shift = dayShifts[0];
        result.nights.push({
            businessDate,
            shiftId: shift.id!,
            billedSalesYen: salesByDate.get(businessDate)?.original_billed_total ?? shift.paid_total,
            guests: shift.guest_count,
        });
    }

    result.nights.sort((a, b) => a.businessDate.localeCompare(b.businessDate));
    return result;
}
