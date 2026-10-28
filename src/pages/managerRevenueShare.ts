import type { ShiftReport } from "../api/account";

/** Confirmed monthly rate schedule for Chuck's revenue-share preview. */
export const SHARE_BASE_RATE = 40;
export const SHARE_CONFIRMED_CAP = 60;
export const SHARE_FIRST_THRESHOLD_YEN = 500_000;
export const SHARE_STEP_YEN = 50_000;
export const SHARE_CAP_THRESHOLD_YEN = 1_450_000;

export type SharePolicy = {
    baseRate: number;
    firstThresholdYen: number;
    stepYen: number;
    incrementPoints: number;
    capRate: number;
};
export const DEFAULT_SHARE_POLICY: SharePolicy = {
    baseRate: SHARE_BASE_RATE,
    firstThresholdYen: SHARE_FIRST_THRESHOLD_YEN,
    stepYen: SHARE_STEP_YEN,
    incrementPoints: 1,
    capRate: SHARE_CONFIRMED_CAP,
};

export type ShareBracket = { from: number; to: number | null; rate: number };
export function shareBrackets(policy: SharePolicy = DEFAULT_SHARE_POLICY): ShareBracket[] {
    const rows: ShareBracket[] = [
        { from: 0, to: policy.firstThresholdYen - 1, rate: policy.baseRate },
    ];
    let from = policy.firstThresholdYen;
    for (let rate = policy.baseRate + policy.incrementPoints; rate < policy.capRate; rate += policy.incrementPoints) {
        rows.push({ from, to: from + policy.stepYen - 1, rate });
        from += policy.stepYen;
    }
    if (policy.capRate > policy.baseRate) rows.push({ from, to: null, rate: policy.capRate });
    else rows[0].to = null;
    return rows;
}

export function eligibleTierRate(
    revenue: number,
    policy: SharePolicy = DEFAULT_SHARE_POLICY,
): number | null {
    if (!Number.isSafeInteger(revenue) || revenue < 0) return null;
    if (revenue < policy.firstThresholdYen) return policy.baseRate;
    const steps = Math.floor((revenue - policy.firstThresholdYen) / policy.stepYen) + 1;
    return Math.min(policy.capRate, policy.baseRate + steps * policy.incrementPoints);
}

export function nextTier(
    revenue: number,
    policy: SharePolicy = DEFAULT_SHARE_POLICY,
): { rate: number; atYen: number; remainingYen: number } | null {
    const rate = eligibleTierRate(revenue, policy);
    if (rate === null || rate >= policy.capRate) return null;
    const currentStep = revenue < policy.firstThresholdYen
        ? 0 : Math.floor((revenue - policy.firstThresholdYen) / policy.stepYen) + 1;
    const atYen = currentStep === 0
        ? policy.firstThresholdYen
        : policy.firstThresholdYen + currentStep * policy.stepYen;
    return { rate: Math.min(policy.capRate, rate + policy.incrementPoints), atYen, remainingYen: atYen - revenue };
}

export type ShareShift = Pick<ShiftReport,
    "id" | "business_date" | "status" | "paid_total" | "opened_by" |
    "working_manager_user_id" | "working_manager_name">;

/** Business date is assigned by the API; don't regroup with UTC. */
export function shareMonths(shifts: ShareShift[]): string[] {
    return [...new Set(shifts.map(s => s.business_date.slice(0, 7))
        .filter(value => /^\d{4}-\d{2}$/.test(value)))]
        .sort((a, b) => b.localeCompare(a));
}

/** Live-shift response supersedes any older closed-shift snapshot. */
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
