import type { Account } from "../api/account";
import type { RevenueShareViewerConfig } from "./managerRevenueShareAccess";

/** Profile-level Chuck pay is private to Chuck; team-wide access belongs in Admin. */
export function canViewChuckPersonalPay(
    viewer: Pick<Account, "id" | "role"> | null,
    subjectUserId: number,
    config: RevenueShareViewerConfig,
): boolean {
    return viewer?.role === "manager" &&
        config.chuckUserId !== null &&
        config.noriUserId !== null &&
        config.chuckUserId !== config.noriUserId &&
        viewer.id === config.chuckUserId &&
        subjectUserId === config.chuckUserId;
}
