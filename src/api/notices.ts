import { apiRequest } from "./client";

export type StockNotice = {
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
