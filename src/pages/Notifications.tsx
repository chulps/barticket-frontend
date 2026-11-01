import { shouldPoll } from "../api/realtime";
import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useSearchParams } from "react-router-dom";
import NotificationActivity from "../components/NotificationActivity";
import NotificationPreferences from "../components/NotificationPreferences";
import NotificationTicket from "../components/NotificationTicket";
import { clearNotificationReturn } from "../api/notificationNavigation";

import { accountApi } from "../api/account";
import PushSettings from "../components/PushSettings";
import { ApiError, getToken } from "../api/client";
import { listNotices, restockNotice, type NoticeList } from "../api/notices";
import { menuLabel, useI18n, type Locale } from "../i18n";
import { dismissRestockNotice } from "../hooks/optimisticOperations";
import { acceptBackgroundSnapshot } from "../hooks/refreshSafety";

function formatWhen(unix: number, locale: Locale) {
    return new Date(unix * 1000).toLocaleTimeString(locale === "ja" ? "ja-JP" : "en-US", {
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function Notifications() {
    const { t, locale } = useI18n();
    const [searchParams] = useSearchParams();
    const rawTicket = searchParams.get("ticket");
    const ticketId = rawTicket && /^[1-9]\d*$/.test(rawTicket) && Number.isSafeInteger(Number(rawTicket)) ? Number(rawTicket) : null;
    useEffect(() => { if (ticketId === null) clearNotificationReturn(); }, [ticketId]);
    const [notices, setNotices] = useState<NoticeList | null>(null);
    const [denied, setDenied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [isManager, setIsManager] = useState(false);
    // Serialize restocks and reject responses from refreshes started before a write.
    const pendingRestock = useRef(false);
    const revision = useRef(0);
    const [pendingNoticeId, setPendingNoticeId] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        let fetching = false;
        let retry: number | undefined;
        const retryRead = () => {
            if (cancelled || retry !== undefined) return;
            retry = window.setTimeout(() => { retry = undefined; void load(); }, 250);
        };
        async function load() {
            if (cancelled) return;
            if (pendingRestock.current || fetching) { retryRead(); return; }
            fetching = true;
            const token = getToken();
            const startedAt = revision.current;
            try {
                const data = await listNotices();
                const safe = acceptBackgroundSnapshot(data, {
                    startedRevision: startedAt,
                    currentRevision: revision.current,
                    pendingWrite: pendingRestock.current,
                    cancelled,
                });
                if (safe === null || getToken() !== token) { retryRead(); return; }
                setDenied(false);
                setLoadFailed(false);
                setNotices(safe);
            } catch (error) {
                if (cancelled || getToken() !== token) return;
                if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                    setDenied(true);
                    setNotices(null);
                    setLoadFailed(false);
                } else {
                    setLoadFailed(true);
                }
            } finally {
                fetching = false;
                if (!cancelled) setLoading(false);
            }
        }
        load();
        let roleGeneration = 0;
        const loadRole = async () => {
            const generation = ++roleGeneration;
            const token = getToken();
            setIsManager(false);
            if (!token) return;
            try {
                const me = await accountApi.me();
                if (!cancelled && generation === roleGeneration && token === getToken()) setIsManager(me.role === "manager");
            } catch { /* Fail closed until the next authenticated refresh. */ }
        };
        void loadRole();
        window.addEventListener("barticket-users-updated", loadRole);
        window.addEventListener("barticket-auth", loadRole);
        const timer = window.setInterval(() => { if (shouldPoll()) void load(); }, 20000);
        window.addEventListener("barticket-auth", load);
        window.addEventListener("barticket-notices", load);
        window.addEventListener("barticket-api-restored", load);
        return () => {
            cancelled = true;
            window.removeEventListener("barticket-users-updated", loadRole);
            window.removeEventListener("barticket-auth", loadRole);
            window.clearInterval(timer);
            if (retry !== undefined) window.clearTimeout(retry);
            window.removeEventListener("barticket-auth", load);
            window.removeEventListener("barticket-notices", load);
            window.removeEventListener("barticket-api-restored", load);
        };
    }, []);

    async function restock(noticeId: number) {
        if (pendingRestock.current || !notices) return;
        pendingRestock.current = true;
        revision.current++;
        setPendingNoticeId(noticeId);
        const previous = notices;
        // Immediately dismiss the notice; the server is still authoritative.
        setNotices(dismissRestockNotice(previous, noticeId));
        try {
            const data = await restockNotice(noticeId);
            revision.current++;
            setNotices(data);
            window.dispatchEvent(new Event("barticket-notices"));
        } catch (error) {
            revision.current++;
            setNotices(previous);
            window.alert(error instanceof ApiError ? error.message : t("stockUpdateFailed"));
            // Reconcile after ambiguous network failures; do not retry the POST.
            try {
                const latest = await listNotices();
                setNotices(latest);
            } catch (readError) {
                console.warn("Could not reconcile notifications", readError);
            }
        } finally {
            revision.current++;
            pendingRestock.current = false;
            setPendingNoticeId(null);
            window.dispatchEvent(new Event("barticket-notices"));
        }
    }

    return (
        <main>
            <Heading>{t("notifications")}</Heading>
            {ticketId !== null ? <NotificationTicket key={ticketId} ticketId={ticketId} /> : null}
            {rawTicket && ticketId === null ? <p role="alert">{locale === "ja" ? "通知のリンクが無効です。通知一覧を表示しています。" : "The notification link is invalid. Your notifications are shown below."}</p> : null}
            <PushSettings />
            <NotificationPreferences />
            {loading ? <p role="status">{locale === "ja" ? "通知を読み込み中…" : "Loading notifications…"}</p> : null}
            {denied ? <p>{locale === "ja" ? "通知を表示する権限を確認できませんでした。再度ログインしてください。" : "Notification access could not be verified. Please sign in again."}</p> : null}
            {loadFailed ? <p role="alert">{locale === "ja" ? "通知を更新できませんでした。" : "Could not refresh notifications."} <button className="small hollow secondary" type="button" onClick={() => window.dispatchEvent(new Event("barticket-notices"))}>{locale === "ja" ? "再試行" : "Retry"}</button></p> : null}
            {!denied && notices && notices.notices.length === 0 ? <p>{t("noNotifications")}</p> : null}
            {!denied && notices
                ? notices.notices.map((notice) => (
                    <Alert key={notice.id}>
                        <AlertText>
                            {t("stockoutLine", { name: notice.by, item: menuLabel(locale, notice.item) })}
                            {" · "}
                            {formatWhen(notice.at, locale)}
                        </AlertText>
                        {isManager ? (
                            <RestockButton
                                type="button"
                                className="small hollow"
                                onClick={() => restock(notice.id)}
                                disabled={pendingNoticeId !== null}
                            >
                                {t("markInStock")}
                            </RestockButton>
                        ) : null}
                    </Alert>
                ))
                : null}
            <NotificationActivity activeStockIds={!denied ? notices?.notices.map(notice => notice.id) ?? [] : []} />
        </main>
    );
}

const Heading = styled.h2`
  padding-top: var(--space-2);
  margin-bottom: var(--space-3);
`;

const Alert = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
`;

const AlertText = styled.p`
  color: var(--danger-400);
  margin: 0;
`;

const RestockButton = styled.button`
  width: auto;
  flex: none;
`;

