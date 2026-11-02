import { apiRequest, getToken } from "./client";
import { createSessionRead } from "./sessionRead";

export type StockNotice = {
    id: number;
    menu_item_id: number;
    item: string;
    at: number;
    by: string;
};

export type NoticeList = {
    business_date: string | null;
    status: "open" | "closed" | null;
    notices: StockNotice[];
};

// Share only concurrent authoritative reads; never retain a settled notice snapshot.
const reads = createSessionRead(getToken, () => apiRequest<NoticeList>("/notices"), Date.now, 0);
const mutations = new Map<Promise<unknown>, { token: string | null; authEpoch: number }>();
let authEpoch = 0;
window.addEventListener("barticket-auth", () => {
    authEpoch++;
    reads.invalidate();
});
window.addEventListener("barticket-notices", reads.invalidate);

export function listNotices(): Promise<NoticeList> {
    const token = getToken();
    const epoch = authEpoch;
    const pending = [...mutations].filter(([, owner]) => owner.token === token && owner.authEpoch === epoch)
        .map(([request]) => request);
    if (!pending.length) return reads.read();
    // A read issued during a restock must not publish its pre-write snapshot.
    return Promise.allSettled(pending).then(() => {
        if (getToken() !== token || authEpoch !== epoch) throw new Error("Session changed during notice refresh");
        return listNotices();
    });
}

export function restockNotice(noticeId: number): Promise<NoticeList> {
    const token = getToken();
    const epoch = authEpoch;
    reads.invalidate();
    const request = apiRequest<NoticeList>(`/notices/${noticeId}/restock`, { method: "POST" });
    mutations.set(request, { token, authEpoch: epoch });
    return request.finally(() => {
        mutations.delete(request);
        if (getToken() === token && authEpoch === epoch) reads.invalidate();
    });
}
