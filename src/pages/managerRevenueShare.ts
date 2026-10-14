import type { ShiftReport } from "../api/account";

/**
 * Frontend-only preview model. The backend owns actual shift attribution,
 * effective-dated compensation rules, payroll costs and authorized writes.
 * The example policy is NOT proof of an employee's payable earnings.
 */
export const SHARE_BASE_RATE = 40;
export const SHARE_PROPOSED_CAP = 60;
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
export type SharePolicyDraft = {
    baseRate: string;
    firstThresholdYen: string;
    stepYen: string;
    incrementPoints: string;
    capRate: string;
};
export const DEFAULT_SHARE_POLICY: SharePolicy = {
    baseRate: SHARE_BASE_RATE,
    firstThresholdYen: SHARE_FIRST_THRESHOLD_YEN,
    stepYen: SHARE_STEP_YEN,
    incrementPoints: 1,
    capRate: SHARE_PROPOSED_CAP,
};
export const defaultSharePolicyDraft: SharePolicyDraft = {
    baseRate: String(DEFAULT_SHARE_POLICY.baseRate),
    firstThresholdYen: String(DEFAULT_SHARE_POLICY.firstThresholdYen),
    stepYen: String(DEFAULT_SHARE_POLICY.stepYen),
    incrementPoints: String(DEFAULT_SHARE_POLICY.incrementPoints),
    capRate: String(DEFAULT_SHARE_POLICY.capRate),
};

function wholeNumber(value: string, min: number, max: number): number | null {
    if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= min && number <= max ? number : null;
}
export function parseSharePolicy(draft: SharePolicyDraft): SharePolicy | null {
    const baseRate = wholeNumber(draft.baseRate, 0, 100);
    const firstThresholdYen = wholeNumber(draft.firstThresholdYen, 1, 1_000_000_000);
    const stepYen = wholeNumber(draft.stepYen, 1, 1_000_000_000);
    const incrementPoints = wholeNumber(draft.incrementPoints, 1, 100);
    const capRate = wholeNumber(draft.capRate, 1, 100);
    if (baseRate === null || firstThresholdYen === null || stepYen === null ||
        incrementPoints === null || capRate === null || capRate < baseRate) return null;
    return { baseRate, firstThresholdYen, stepYen, incrementPoints, capRate };
}

export type ShareShift = Pick<ShiftReport,
    "id" | "business_date" | "status" | "paid_total" | "opened_by">;

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

/** Business date is already assigned by the API; don't regroup with UTC. */
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

export type ShareSelection = {
    selected: ShareShift[];
    eligibleRevenue: number | null;
    selectedOpen: number;
    unverifiedRevenue: number;
    tierRate: number | null;
    next: ReturnType<typeof nextTier>;
};

/**
 * Eligibility MUST be explicitly chosen for this temporary scenario.
 * Neither opened_by name nor clock punches authorize a salary calculation.
 */
export function shareSelection(
    shifts: ShareShift[], month: string, selectedIds: ReadonlySet<number>,
    policy: SharePolicy | null = DEFAULT_SHARE_POLICY,
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
        tierRate: eligibleRevenue === null || !policy ? null : eligibleTierRate(eligibleRevenue, policy),
        next: eligibleRevenue === null || !policy ? null : nextTier(eligibleRevenue, policy),
    };
}

/** Two unapproved alternatives to illustrate the unresolved tier method. */
export function flatShareScenario(
    revenue: number | null, policy: SharePolicy = DEFAULT_SHARE_POLICY,
): number | null {
    if (revenue === null) return null;
    const rate = eligibleTierRate(revenue, policy);
    return rate === null ? null : Math.round(revenue * rate / 100);
}
export function marginalShareScenario(
    revenue: number | null, policy: SharePolicy = DEFAULT_SHARE_POLICY,
): number | null {
    if (revenue === null || eligibleTierRate(revenue, policy) === null) return null;
    let remaining = revenue;
    let total = 0;
    for (const bracket of shareBrackets(policy)) {
        if (remaining <= 0) break;
        const width = bracket.to === null ? remaining : bracket.to - bracket.from + 1;
        const portion = Math.min(remaining, width);
        total += portion * bracket.rate / 100;
        remaining -= portion;
    }
    return Math.round(total);
}

/** Missing costs remain unknown, not zero. No draft is saved. */
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
    return wholeNumber(raw, 0, 1_000_000_000);
}
export function netShareScenario(gross: number | null, draft: DraftShareCosts): number | null {
    if (gross === null) return null;
    const amounts = Object.values(draft).map(parseDraftYen);
    if (amounts.some(value => value === null)) return null;
    const [staffWages, drinkback, deductions, reimbursements] = amounts as number[];
    const net = gross - staffWages - drinkback - deductions + reimbursements;
    return Number.isSafeInteger(net) ? net : null;
}
