import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ApiError, API_URL, getDeviceId, getToken } from "../api/client";
import { collectAnalyticsExport, type ExportScope } from "../pages/analyticsDataExport";
import Icon from "./Icon";

export default function DataDownload({ locale, scope = "all-time" }: { locale: "en" | "ja"; scope?: ExportScope }) {
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState("");
    const running = useRef<AbortController | null>(null);
    const ja = locale === "ja";
    const label = scope === "menu" ? (ja ? "メニューのJSONをダウンロード" : "Download menu data (JSON)")
        : scope === "admin" ? (ja ? "管理データのJSONをダウンロード" : "Download admin data (JSON)")
        : (ja ? "全期間のJSONをダウンロード" : "Download all data (JSON)");
    const description = scope === "menu" ? (ja ? "販売中とアーカイブ済みの全商品、価格、在庫情報を保存します。検索条件は適用されません。" : "Exports all active and archived items, prices and stock, regardless of your search filter.")
        : scope === "admin" ? (ja ? "有効なチームアカウントとシフト履歴を保存します。パスワードや未保存の給与設定は含まれません。" : "Exports active team accounts and shift history. Passwords and unsaved payroll drafts are not included.")
        : (ja ? "チケット、シフト、メニュー、チーム情報を含むAPIエクスポートです。完全なデータベースバックアップではありません。" : "Includes tickets, shifts, menus and team data available through the API. This is not a full database backup.");
    useEffect(() => () => running.current?.abort(), []);

    async function download() {
        if (running.current) return;
        const controller = new AbortController();
        running.current = controller;
        setBusy(true);
        setStatus("");
        const token = getToken();
        const sameSession = () => {
            if (!token || getToken() !== token) throw new ApiError(401, "Session changed");
        };
        try {
            sameSession();
            const me = await fetch(`${API_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]), cache: "no-store",
            });
            sameSession();
            if (!me.ok) throw new ApiError(me.status, "Session check failed");
            const account = await me.json();
            if (scope !== "menu" && account.role !== "manager") throw new ApiError(403, "Manager required");
            const result = await collectAnalyticsExport(async (path) => {
                sameSession();
                const response = await fetch(`${API_URL}${path}`, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${token}`, "X-BarTicket-Device": getDeviceId() },
                    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(60_000)]),
                    cache: "no-store",
                });
                sameSession();
                if (!response.ok) throw new ApiError(response.status, "Export request failed");
                return response.json();
            }, ({ completed, total }) => {
                if (!controller.signal.aborted) setStatus(ja ? `${completed}/${total} 件を取得済み…` : `Fetching data… ${completed}/${total}`);
            }, scope);
            sameSession();
            if (controller.signal.aborted) return;
            const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `barticket-${scope}-${result.finished_at.replace(/[:.]/g, "-")}${result.all_requested_sources_exported ? "" : "-partial"}.json`;
            document.body.appendChild(link);
            try { link.click(); } finally {
                link.remove();
                // Allow the browser time to begin saving before releasing the blob.
                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }
            setStatus(result.all_requested_sources_exported
                ? (ja ? "JSONファイルを作成しました。取得範囲はファイル内で確認できます。" : "JSON download prepared. Coverage details are included in the file.")
                : (ja ? "一部のデータを取得できませんでした。JSON内の失敗した取得元を確認してください。" : "Partial export downloaded. Check failed sources in the JSON; retry to retrieve missing data."));
        } catch (error) {
            if (!controller.signal.aborted) setStatus(error instanceof ApiError && error.status === 401
                ? (ja ? "再ログインしてから、もう一度お試しください。" : "Sign in again, then retry the export.")
                : (ja ? "ダウンロードできませんでした。もう一度お試しください。" : "Could not download data. Please retry."));
        } finally {
            if (running.current === controller) running.current = null;
            if (!controller.signal.aborted) setBusy(false);
        }
    }

    return <DownloadArea>
        <button type="button" className="hollow secondary" disabled={busy} onClick={() => void download()}>
            <Icon name="DownloadSimple" size={22} />
            <span>{label}</span>
        </button>
        <small>{description}</small>
        <span role="status" aria-live="polite">{status}</span>
    </DownloadArea>;
}

const DownloadArea = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-0);
    button { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 44px; max-width: 100%; box-sizing: border-box; white-space: normal; }
    button span { min-width: 0; overflow-wrap: anywhere; }
    button svg { flex-shrink: 0; }
    small, [role="status"] { color: var(--neutral-300); font-size: var(--font-size-small); }
    [role="status"]:empty { display: none; }
`;

