import { useEffect, useState } from "react";
import styled from "styled-components";

import { ApiError } from "../api/client";
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

    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const data = await listNotices();
                if (cancelled) return;
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
        const timer = window.setInterval(load, 20000);
        window.addEventListener("barticket-auth", load);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
            window.removeEventListener("barticket-auth", load);
        };
    }, []);

    async function restock(noticeId: number) {
        try {
            const data = await restockNotice(noticeId);
            setNotices(data);
            window.dispatchEvent(new Event("barticket-notices"));
        } catch (error) {
            window.alert(error instanceof ApiError ? error.message : t("stockUpdateFailed"));
        }
    }

    return (
        <main>
            <Heading>{t("notifications")}</Heading>
            {denied ? <p>{t("managersOnly")}</p> : null}
            {!denied && notices && notices.notices.length === 0 ? <p>{t("noNotifications")}</p> : null}
            {!denied && notices
                ? notices.notices.map((notice) => (
                    <Alert key={notice.id}>
                        <AlertText>
                            {t("stockoutLine", { name: notice.by, item: menuLabel(locale, notice.item) })}
                            {" · "}
                            {formatWhen(notice.at, locale)}
                        </AlertText>
                        <RestockButton
                            type="button"
                            className="small hollow"
                            onClick={() => restock(notice.id)}
                        >
                            {t("markInStock")}
                        </RestockButton>
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
