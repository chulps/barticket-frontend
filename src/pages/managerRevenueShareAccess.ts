import type { Account } from "../api/account";

/**
 * UI-only visibility gate. These are public build-time IDs, NOT secrets or
 * server authorization. An unconfigured build denies access by default.
 * The backend must enforce private salary permissions before exposing pay.
 */
function accountId(raw: string | undefined): number | null {
    if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isSafeInteger(id) ? id : null;
}

export type RevenueShareViewerConfig = {
    chuckUserId: number | null;
    noriUserId: number | null;
};

export function readRevenueShareViewers(): RevenueShareViewerConfig {
    return {
        chuckUserId: accountId(import.meta.env.VITE_REVENUE_SHARE_CHUCK_USER_ID),
        noriUserId: accountId(import.meta.env.VITE_REVENUE_SHARE_NORI_USER_ID),
    };
}

export function canSeeChuckRevenueShare(
    viewer: Pick<Account, "id" | "role"> | null,
    subjectUserId: number,
    config: RevenueShareViewerConfig,
): boolean {
    const { chuckUserId, noriUserId } = config;
    // Both specific account IDs must be configured. No names, emails, or role
    // alone can grant access. The subject must ALWAYS be Chuck's account.
    return viewer?.role === "manager" &&
        chuckUserId !== null && noriUserId !== null &&
        chuckUserId !== noriUserId &&
        subjectUserId === chuckUserId &&
        (viewer.id === chuckUserId || viewer.id === noriUserId);
}
