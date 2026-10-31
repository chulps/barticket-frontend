import { apiRequest } from "./client";
export type RevenueShareTier = { threshold_yen: number; rate_percent: number };
export type RevenueSharePolicy = { revision: number; effective_month: string | null; tiers: RevenueShareTier[]; source?: string; application_method: "flat_monthly_confirmed"; rounding: "nearest_yen_half_up" };
export type RevenueSharePolicyVersion = { revision: number; effective_month: string; tiers: RevenueShareTier[]; reason: string; source: string; created_by_name: string; created_at: string; supersedes_revision: number | null };
export type RevenueSharePolicies = { beneficiary_user_id: number; owner_user_id: number; can_edit: boolean; revision: number; current_month: string; earliest_effective_month: string; legacy_policy: RevenueSharePolicy; versions: RevenueSharePolicyVersion[] };
export const revenueSharePolicyApi = {
    list: () => apiRequest<RevenueSharePolicies>("/payroll/revenue-share/policies"),
    schedule: (body: { effective_month: string; tiers: RevenueShareTier[]; reason: string; source: string; expected_revision: number }) => apiRequest<RevenueSharePolicies>("/payroll/revenue-share/policies", { method: "POST", body }),
};
