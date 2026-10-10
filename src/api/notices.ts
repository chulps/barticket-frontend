import { apiRequest } from "./client";

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

export function listNotices(): Promise<NoticeList> {
    return apiRequest<NoticeList>("/notices");
}

export function restockNotice(noticeId: number): Promise<NoticeList> {
    return apiRequest<NoticeList>(`/notices/${noticeId}/restock`, { method: "POST" });
}
