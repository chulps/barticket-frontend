import { useEffect, useState } from "react";
import { accountApi, type AnalyticsShiftReport } from "../api/account";
import { getToken } from "../api/client";
import { shouldPoll } from "../api/realtime";
import { startBackgroundRefresh } from "./backgroundRefresh";
import { analyticsTicketScope } from "./ticketReadScope";

export function useAnalyticsReports(range: "all" | "year" | "month" | "day", key: string, signedIn: boolean) {
    const scopeKey = `${range}:${key}`;
    const [snapshot, setSnapshot] = useState<{key: string; rows: AnalyticsShiftReport[]; error: boolean} | null>(null);
    useEffect(() => {
        if (!signedIn || (range !== "all" && !key)) return;
        let cancelled = false;
        const stop = startBackgroundRefresh({
            shouldPoll,
            events: ["barticket-push", "barticket-analytics-updated", "barticket-shift-updated", "barticket-auth", "barticket-users-updated"],
            refresh: async () => {
                const token = getToken();
                try {
                    const rows = await accountApi.analyticsShifts(analyticsTicketScope(range, key));
                    if (cancelled || token !== getToken()) return;
                    // Replace, never append: removals, moves and cancellations must disappear.
                    setSnapshot({key: scopeKey, rows, error: false});
                } catch {
                    if (cancelled || token !== getToken()) return;
                    setSnapshot(previous => ({key: scopeKey, rows: previous?.key === scopeKey ? previous.rows : [], error: true}));
                }
            },
        });
        return () => { cancelled = true; stop(); };
    }, [range, key, scopeKey, signedIn]);
    const current = snapshot?.key === scopeKey ? snapshot : null;
    return { shifts: current?.rows ?? [], ready: current !== null, error: current?.error ?? false };
}
