import { useEffect, useState } from "react";
import { ticketsApi, toTicket } from "../api/tickets";
import { getToken } from "../api/client";
import { shouldPoll } from "../api/realtime";
import type { Ticket } from "../types/Ticket";
import { startBackgroundRefresh } from "./backgroundRefresh";
import { analyticsTicketScope } from "./ticketReadScope";

export function useAnalyticsTickets(range: "all" | "year" | "month" | "day", key: string, signedIn: boolean) {
    const scopeKey = `${range}:${key}`;
    const [snapshot, setSnapshot] = useState<{key: string; rows: Ticket[]; error: boolean} | null>(null);
    useEffect(() => {
        if (!signedIn || (range !== "all" && !key)) return;
        let cancelled = false;
        const stop = startBackgroundRefresh({
            shouldPoll,
            events: ["barticket-push", "barticket-analytics-updated", "barticket-shift-updated", "barticket-auth"],
            refresh: async () => {
                const token = getToken();
                try {
                    const rows = await ticketsApi.list(analyticsTicketScope(range, key));
                    if (cancelled || token !== getToken()) return;
                    // Replace, never append: removals, moves and cancellations must disappear.
                    setSnapshot({key: scopeKey, rows: rows.map(toTicket), error: false});
                } catch {
                    if (cancelled || token !== getToken()) return;
                    setSnapshot(previous => ({key: scopeKey, rows: previous?.key === scopeKey ? previous.rows : [], error: true}));
                }
            },
        });
        return () => { cancelled = true; stop(); };
    }, [range, key, scopeKey, signedIn]);
    const current = snapshot?.key === scopeKey ? snapshot : null;
    return { tickets: current?.rows ?? [], ready: current !== null, error: current?.error ?? false };
}
