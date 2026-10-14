import type { ShiftReport } from "../api/account";

/**
 * PREVIEW MODEL ONLY.
 * User-proposed rules: qualifying *Chuck-managed shifts only*, +1 point per
 * ¥50,000 of monthly eligible revenue from 40% to proposed 60% ceiling.
 * The authoritative policy, manager assignment and settlement belong to the
 * backend. Never silently infer eligibility from opened_by or punch names.
 */
export const SHARE_BASE_RATE = 40;
export const SHARE_PROPOSED_CAP = 60;
export const SHARE_FIRST_THRESHOLD_YEN = 500_000;
export const SHARE_STEP_YEN = 50_000;
export const SHARE_CAP_THRESHOLD_YEN = 1_450_000;

export type ShareShift = Pick<ShiftReport,
    "id" | "business_date" | "status" | "paid_total" | "opened_by">;

export function eligibleTierRate(revenue: number): number | null {
    if (!Number.isSafeInteger(revenue) || revenue < 0) return null;
    if (revenue < SHARE_FIRST_THRESHOLD_YEN) return SHARE_BASE_RATE;
    return Math.min(
        SHARE_PROPOSED_CAP,
        41 + Math.floor((revenue - SHARE_FIRST_THRESHOLD_YEN) / SHARE_STEP_YEN),
    );
}

export function nextTier(revenue: number): { rate: number; atYen: number; remainingYen: number } | null {
    const rate = eligibleTierRate(revenue);
    if (rate === null || rate >= SHARE_PROPOSED_CAP) return null;
    const atYen = rate === SHARE_BASE_RATE
        ? SHARE_FIRST_THRESHOLD_YEN
        : SHARE_FIRST_THRESHOLD_YEN + (rate - SHARE_BASE_RATE) * SHARE_STEP_YEN;
    return { rate: rate + 1, atYen, remainingYen: atYen - revenue };
}

export type ShareBracket = { from: number; to: number | null; rate: number };
export function shareBrackets(): ShareBracket[] {
    const rows: ShareBracket[] = [
        { from: 0, to: SHARE_FIRST_THRESHOLD_YEN - 1, rate: SHARE_BASE_RATE },
    ];
    for (let rate = 41; rate <= SHARE_PROPOSED_CAP; rate++) {
        const from = SHARE_FIRST_THRESHOLD_YEN + (rate - 41) * SHARE_STEP_YEN;
        rows.push({
            from,
            to: rate === SHARE_PROPOSED_CAP ? null : from + SHARE_STEP_YEN - 1,
            rate,
        });
    }
    return rows;
}

/** Keep business_date in Asia/Tokyo's business-month grouping; no UTC conversion. */
export function shareMonths(shifts: ShareShift[]): string[] {
    return [...new Set(shifts.map(s => s.business_date?.slice(0, 7))
        .filter((value): value is string => /^\d{4}-\d{2}$/.test(value ?? "")))]
        .sort((a, b) => b.localeCompare(a));
}

/** Closed-shift snapshots and the current open shift might share the same ID. */
export function distinctShareShifts(shifts: ShareShift[]): ShareShift[] {
    const unique = new Map<number, ShareShift>();
    for (const shift of shifts) {
        if (!Number.isSafeInteger(shift.id) || shift.id <= 0) continue;
        const previous = unique.get(shift.id);
        if (!previous || shift.status === "open") unique.set(shift.id, shift);
    }
    return [...unique.values()].sort((a, b) =>
        b.business_date.localeCompare(a.business_date) || b.id - a.id);
}

export type ShareSelection = {
    selected: ShareShift[];
    eligibleRevenue: number | null;
    selectedOpen: number;
    unverifiedRevenue: number;
    tierRate: number | null;
    next: ReturnType<typeof nextTier>;
};

/**
 * Explicit opt-in. A manager must manually select each eligible shift for a
 * temporary scenario. Neither 'opened_by' nor punches establish entitlement.
 */
export function shareSelection(
    shifts: ShareShift[], month: string, selectedIds: ReadonlySet<number>,
): ShareSelection {
    const selected = distinctShareShifts(shifts)
        .filter(shift => shift.business_date.startsWith(month) && selectedIds.has(shift.id));
    const unverifiedRevenue = selected.filter(shift =>
        !Number.isSafeInteger(shift.paid_total) || shift.paid_total < 0).length;
    const total = selected.reduce((sum, shift) => sum + shift.paid_total, 0);
    const eligibleRevenue = selected.length && !unverifiedRevenue &&
        Number.isSafeInteger(total) && total >= 0 ? total : null;
    return {
        selected,
        eligibleRevenue,
        selectedOpen: selected.filter(s => s.status === "open").length,
        unverifiedRevenue,
        tierRate: eligibleRevenue === null ? null : eligibleTierRate(eligibleRevenue),
        next: eligibleRevenue === null ? null : nextTier(eligibleRevenue),
    };
}

/** One illustrative total if a flat whole-month tier is eventually approved. */
export function flatShareScenario(revenue: number | null): number | null {
    if (revenue === null) return null;
    const rate = eligibleTierRate(revenue);
    return rate === null ? null : Math.round(revenue * rate / 100);
}

/**
 * Alternative marginal tranche scenario. This is NOT an approved pay method.
 * Separately applying the percentage within each tranche can yield less pay
 * than applying the final tier to the full month's eligible revenue.
 */
export function marginalShareScenario(revenue: number | null): number | null {
    if (revenue === null || eligibleTierRate(revenue) === null) return null;
    let remaining = revenue;
    let total = 0;
    for (const bracket of shareBrackets()) {
        if (remaining <= 0) break;
        const width = bracket.to === null
            ? remaining : bracket.to - bracket.from + 1;
        const portion = Math.min(remaining, width);
        total += portion * bracket.rate / 100;
        remaining -= portion;
    }
    return Math.round(total);
}

/** Missing cost inputs stay unknown, not zero. No data is persisted. */
export type DraftShareCosts = {
    staffWages: string;
    drinkback: string;
    deductions: string;
    reimbursements: string;
};
export const blankShareCosts: DraftShareCosts = {
    staffWages: "", drinkback: "", deductions: "", reimbursements: "",
};

export function parseDraftYen(raw: string): number | null {
    if (!/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function netShareScenario(gross: number | null, draft: DraftShareCosts): number | null {
    if (gross === null) return null;
    const amounts = Object.values(draft).map(parseDraftYen);
    if (amounts.some(value => value === null)) return null;
    const [staffWages, drinkback, deductions, reimbursements] = amounts as number[];
    const net = gross - staffWages - drinkback - deductions + reimbursements;
    return Number.isSafeInteger(net) ? net : null;
}
