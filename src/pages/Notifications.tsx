import { useEffect, useRef, useState } from "react";
import styled from "styled-components";

import { accountApi } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { listNotices, restockNotice, type NoticeList } from "../api/notices";
import { menuLabel, useI18n, type Locale } from "../i18n";

function formatWhen(unix: number, locale: Locale) {
    return new Date(unix * 1000).toLocaleTimeString(locale === "ja" ? "ja-JP" : "en-US", {
        hour: "numeric",
        minute: "2-digit",
    });
}

export default function Notifications() {
    const { t, locale } = useI18n();
    const [notices, setNotices] = useState<NoticeList | null>(null);
    const [denied, setDenied] = useState(false);
    const [isManager, setIsManager] = useState(false);
    // Serialize restocks and reject responses from refreshes started before a write.
    const pendingRestock = useRef(false);
    const revision = useRef(0);
    const [pendingNoticeId, setPendingNoticeId] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (pendingRestock.current) return;
            const startedAt = revision.current;
            try {
                const data = await listNotices();
                if (cancelled || pendingRestock.current || revision.current !== startedAt) return;
                setDenied(false);
                setNotices(data);
            } catch (error) {
                if (cancelled) return;
                if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                    setDenied(true);
                    setNotices(null);
                }
            }
        }
        load();
        if (getToken()) {
            accountApi.me().then((me) => {
                if (!cancelled) setIsManager(me.role === "manager");
            }).catch(() => {
                if (!cancelled) setIsManager(false);
            });
        }
        const timer = window.setInterval(load, 20000);
        window.addEventListener("barticket-auth", load);
        window.addEventListener("barticket-notices", load);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            window.removeEventListener("barticket-auth", load);
            window.removeEventListener("barticket-notices", load);
        };
    }, []);

    async function restock(noticeId: number) {
        if (pendingRestock.current || !notices) return;
        pendingRestock.current = true;
        revision.current++;
        setPendingNoticeId(noticeId);
        const previous = notices;
        // Immediately dismiss the notice; the server is still authoritative.
        setNotices({ ...previous, notices: previous.notices.filter(notice => notice.id !== noticeId) });
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
        }
    }

    return (
        <main>
            <Heading>{t("notifications")}</Heading>
            {denied ? <p>{t("clockInForNotices")}</p> : null}
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
