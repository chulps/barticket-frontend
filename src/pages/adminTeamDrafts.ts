/** Frontend-only draft validation. No API, persistence or payroll calculations. */
export type PayBasis = "" | "hourly" | "manager" | "guest" | "other";
export type RateDraft = {
    basis: PayBasis;
    hourlyYen: string;
    effectiveFrom: string;
    reason: string;
};
export type DrinkbackMode = "" | "none" | "fixed" | "percentage";
export type DrinkbackDraft = {
    mode: DrinkbackMode;
    amount: string;
    effectiveFrom: string;
    reason: string;
};
export type HoursDraft = {
    shiftId: string;
    correctedHours: string;
    reason: string;
};
export type BonusDraft = {
    shiftId: string;
    adjustmentYen: string;
    reason: string;
};

export const initialRateDraft: RateDraft = { basis: "", hourlyYen: "", effectiveFrom: "", reason: "" };
export const initialDrinkbackDraft: DrinkbackDraft = { mode: "", amount: "", effectiveFrom: "", reason: "" };
export const initialHoursDraft: HoursDraft = { shiftId: "", correctedHours: "", reason: "" };
export const initialBonusDraft: BonusDraft = { shiftId: "", adjustmentYen: "", reason: "" };

export function validDate(input: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return false;
    const parsed = new Date(input + "T00:00:00Z");
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === input;
}
export function validInteger(input: string, allowNegative = false): boolean {
    if (!(allowNegative ? /^-?\d+$/ : /^\d+$/).test(input)) return false;
    return Number.isSafeInteger(Number(input)) && Math.abs(Number(input)) <= 1000000000;
}
export function validHours(input: string): boolean {
    if (!/^\d+(?:\.\d{1,2})?$/.test(input)) return false;
    const n = Number(input);
    return Number.isFinite(n) && n >= 0 && n <= 24;
}
export function validRateDraft(draft: RateDraft): boolean {
    return draft.basis !== "" && validDate(draft.effectiveFrom) &&
        draft.reason.trim().length >= 4 &&
        (draft.basis !== "hourly" || validInteger(draft.hourlyYen));
}
export function validDrinkbackDraft(draft: DrinkbackDraft): boolean {
    if (!draft.mode || !validDate(draft.effectiveFrom) || draft.reason.trim().length < 4) return false;
    if (draft.mode === "none") return true;
    if (!validInteger(draft.amount)) return false;
    return draft.mode !== "percentage" || Number(draft.amount) <= 100;
}
export function validHoursDraft(draft: HoursDraft, availableShiftIds: number[]): boolean {
    return availableShiftIds.includes(Number(draft.shiftId)) &&
        validHours(draft.correctedHours) && draft.reason.trim().length >= 4;
}
export function validBonusDraft(draft: BonusDraft, availableShiftIds: number[]): boolean {
    return availableShiftIds.includes(Number(draft.shiftId)) &&
        validInteger(draft.adjustmentYen, true) && Number(draft.adjustmentYen) !== 0 &&
        draft.reason.trim().length >= 4;
}
