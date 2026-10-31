import styled from "styled-components";

import type { Account, ShiftReport } from "../api/account";
import type { NoticeList } from "../api/notices";
import type { Ticket } from "../types/Ticket";
import { localeTag, menuLabel, useI18n } from "../i18n";
import { clockedInTeam, type OnDuty } from "./analyticsCurrentShift";
import { creatorDisplayName } from "../utils/creatorDisplayName";

function formatYen(amount: number): string {
    return `¥${amount.toLocaleString("ja-JP")}`;
}

function shiftTime(timestamp: number, locale: "en" | "ja"): string {
    return new Date(timestamp * 1000).toLocaleTimeString(localeTag(locale), {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tokyo",
    });
}

export default function OpenShiftOverview({
    shift,
    tickets,
    members,
    notices,
    updatedAt,
    dateLabel,
}: {
    shift: ShiftReport;
    tickets: Ticket[];
    members: Account[] | null;
    notices: NoticeList | null;
    updatedAt: number | null;
    dateLabel: string;
}) {
    const { t, locale } = useI18n();
    const shiftTickets = tickets.filter((ticket) => ticket.shiftId === shift.id);
    const openTickets = shiftTickets.filter((ticket) => ticket.status === "open");
    const onDuty = clockedInTeam(shift, members);
    const managers = onDuty.filter((person) => person.role === "manager");
    const staff = onDuty.filter((person) => person.role === "staff");
    const unknownRoles = onDuty.filter((person) => person.role === null);
    const activeStockouts = notices?.status === "open" && notices.business_date === shift.business_date
        ? notices.notices : null;
    const averageTicket = shift.paid_count > 0 ? Math.round(shift.paid_total / shift.paid_count) : 0;
    const metrics = [
        { label: locale === "ja" ? "売上（現時点）" : "Revenue so far", value: formatYen(shift.paid_total), featured: true },
        { label: locale === "ja" ? "未会計のチケット" : "Open tickets", value: String(openTickets.length) },
        { label: locale === "ja" ? "会計済みチケット" : "Paid tickets", value: String(shift.paid_count) },
        { label: locale === "ja" ? "会計済みのお客様" : "Guests on paid tickets", value: String(shift.guest_count) },
        { label: locale === "ja" ? "キャンセル" : "Cancelled tickets", value: String(shift.cancelled_count) },
        { label: locale === "ja" ? "会計済みチケットの平均" : "Average paid ticket", value: shift.paid_count ? formatYen(averageTicket) : "—" },
    ];
    const roster = (people: OnDuty[]) =>
        people.length ? <People>{people.map((person) => <li key={person.id}>{person.name}</li>)}</People>
            : <Muted>{locale === "ja" ? "現在いません" : "None clocked in"}</Muted>;

    return (
        <LiveView>
            <LiveHeader>
                <div>
                    <LiveStatus><StatusDot />{locale === "ja" ? "営業中" : "SHIFT IN PROGRESS"}</LiveStatus>
                    <h2>{dateLabel}</h2>
                    <HeaderMeta>
                        {locale === "ja" ? "開始" : "Started"} <strong>{shiftTime(shift.opened_at, locale)} JST</strong>
                        <span aria-hidden="true">·</span>
                        {locale === "ja" ? "開始した人" : "Opened by"} <strong title={shift.opened_by}>{creatorDisplayName(shift.opened_by)}</strong>
                    </HeaderMeta>
                </div>
                {updatedAt !== null ? (
                    <LastUpdated>{locale === "ja" ? "最終更新" : "Last updated"} {shiftTime(updatedAt, locale)}
                        <small>{locale === "ja" ? "変更時に更新（接続不良時は定期確認）" : "Updates on changes; periodic checks if disconnected"}</small>
                    </LastUpdated>
                ) : null}
            </LiveHeader>

            <LiveMetrics>
                {metrics.map((metric) => (
                    <LiveMetric key={metric.label} $featured={Boolean(metric.featured)}>
                        <label>{metric.label}</label>
                        <strong>{metric.value}</strong>
                    </LiveMetric>
                ))}
            </LiveMetrics>

            <LivePanels>
                <LivePanel>
                    <PanelTitle>
                        <h3>{locale === "ja" ? "勤務中" : "Clocked in"}</h3>
                        <PanelCount>{onDuty.length}</PanelCount>
                    </PanelTitle>
                    <SectionLabel>{locale === "ja" ? "マネージャー" : "Managers"}</SectionLabel>
                    {roster(managers)}
                    <SectionLabel>{locale === "ja" ? "スタッフ" : "Staff"}</SectionLabel>
                    {roster(staff)}
                    {unknownRoles.length > 0 ? (
                        <>
                            <SectionLabel>{locale === "ja" ? "役職未確認" : "Role unavailable"}</SectionLabel>
                            {roster(unknownRoles)}
                        </>
                    ) : null}
                </LivePanel>

                <LivePanel>
                    <PanelTitle>
                        <h3>{locale === "ja" ? "品切れ" : "Out of stock"}</h3>
                        <PanelCount>{activeStockouts === null ? "—" : activeStockouts.length}</PanelCount>
                    </PanelTitle>
                    {activeStockouts === null ? (
                        <Muted>{locale === "ja" ? "現在の在庫状況を取得できません" : "Current stock status unavailable"}</Muted>
                    ) : activeStockouts.length === 0 ? (
                        <Muted>{locale === "ja" ? "現在の品切れはありません" : "No active stockouts"}</Muted>
                    ) : (
                        <DetailList>
                            {activeStockouts.map((notice) => (
                                <li key={notice.id}>
                                    <NoticeName>{menuLabel(locale, notice.item)}</NoticeName>
                                    <small>{notice.by} · {shiftTime(notice.at, locale)}</small>
                                </li>
                            ))}
                        </DetailList>
                    )}
                </LivePanel>

                <LivePanel>
                    <PanelTitle><h3>{locale === "ja" ? "支払い方法別" : "Payments so far"}</h3></PanelTitle>
                    <PaymentList>
                        <li><Swatch $color="var(--success-400)" /><span>{t("cash")}</span><strong>{formatYen(shift.cash_total)}</strong></li>
                        <li><Swatch $color="var(--royal-400)" /><span>{t("card")}</span><strong>{formatYen(shift.card_total)}</strong></li>
                        <li><Swatch $color="var(--neutral-300)" /><span>{t("other")}</span><strong>{formatYen(shift.other_total)}</strong></li>
                    </PaymentList>
                </LivePanel>

                <LivePanel>
                    <PanelTitle>
                        <h3>{locale === "ja" ? "未会計のチケット" : "Open tickets"}</h3>
                        <PanelCount>{openTickets.length}</PanelCount>
                    </PanelTitle>
                    {openTickets.length === 0 ? (
                        <Muted>{locale === "ja" ? "未会計のチケットはありません" : "No open tickets"}</Muted>
                    ) : (
                        <DetailList>
                            {openTickets.map((ticket) => (
                                <li key={ticket.id}>
                                    <NoticeName>{ticket.name || `#${ticket.id}`}</NoticeName>
                                    <strong>{formatYen(ticket.items.reduce((sum, item) => sum + item.subtotal, 0))}</strong>
                                </li>
                            ))}
                        </DetailList>
                    )}
                    {openTickets.length > 0 ? <Footnote>{locale === "ja" ? "未会計の金額は売上に含まれません" : "Unpaid amounts are not included in revenue."}</Footnote> : null}
                </LivePanel>
            </LivePanels>
        </LiveView>
    );
}

const LiveView = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
`;

const LiveHeader = styled.header`
    background: var(--neutral-900);
    padding: var(--space-2);
    border-radius: 12px;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-1);
    min-width: 0;
    > div:first-child { min-width: 0; max-width: 100%; }
    h2 { font-size: var(--font-size-h4); font-weight: 500; margin-top: var(--space-1); overflow-wrap: anywhere; }
`;

const LiveStatus = styled.div`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--success-300);
    font-weight: 600;
    font-size: var(--font-size-small);
    letter-spacing: 0.04em;
`;

const StatusDot = styled.span`
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--success-400);
`;

const HeaderMeta = styled.p`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    margin-top: var(--space-1);
    min-width: 0;
    max-width: 100%;
    overflow-wrap: anywhere;
    color: var(--neutral-300);
    strong { color: var(--neutral-100); font-weight: 500; min-width: 0; overflow-wrap: anywhere; }
`;

const LastUpdated = styled.div`
    text-align: right;
    color: var(--neutral-400);
    font-size: var(--font-size-small);
    small { display: block; }
    @media (max-width: 500px) { text-align: left; }
`;

const LiveMetrics = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);
    @media (min-width: 840px) {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
`;

const LiveMetric = styled.div<{ $featured: boolean }>`
    min-width: 0;
    padding: var(--space-2);
    border-radius: 12px;
    background: var(--neutral-900);
    grid-column: ${({ $featured }) => $featured ? "span 2" : "auto"};
    label { display: block; color: var(--neutral-400); font-size: var(--font-size-small); }
    strong {
        display: block;
        margin-top: var(--space-0);
        font-family: var(--font-family-data);
        font-size: var(--font-size-h3);
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        overflow-wrap: anywhere;
    }
`;

const LivePanels = styled.div`
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-1);
    align-items: start;
    @media (min-width: 840px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
`;

const LivePanel = styled.section`
    min-width: 0;
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;
`;

const PanelTitle = styled.header`
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-bottom: var(--space-1);
    h3 { font-size: var(--font-size-h5); font-weight: 500; }
`;

const PanelCount = styled.span`
    margin-left: auto;
    font-family: var(--font-family-data);
    color: var(--neutral-300);
`;

const SectionLabel = styled.h4`
    color: var(--neutral-400);
    font-size: var(--font-size-small);
    font-weight: 500;
    margin-top: var(--space-1);
    margin-bottom: var(--space-0);
`;

const People = styled.ul`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-0);
    li {
        color: var(--neutral-100);
        background: var(--neutral-800);
        border: 1px solid var(--neutral-700);
        border-radius: 6px;
        padding: 0.375rem 0.625rem;
    }
`;

const Muted = styled.p`
    color: var(--neutral-400);
    font-size: var(--font-size-small);
    margin: 0;
`;

const DetailList = styled.ul`
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--space-0);
    li {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: var(--space-1);
        border-bottom: 1px solid var(--neutral-700);
        padding-block: var(--space-0);
        min-width: 0;
    }
    li:last-child { border-bottom: none; }
    strong { font-family: var(--font-family-data); font-weight: 500; }
    small { color: var(--neutral-400); }
`;

const NoticeName = styled.span`
    overflow-wrap: anywhere;
`;

const PaymentList = styled.ul`
    list-style: none;
    padding: 0;
    margin: 0;
    li {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        padding-block: var(--space-0);
    }
    strong {
        margin-left: auto;
        font-family: var(--font-family-data);
        font-variant-numeric: tabular-nums;
        font-weight: 500;
    }
`;

const Swatch = styled.span<{ $color: string }>`
    width: 0.65rem;
    height: 0.65rem;
    flex: none;
    border-radius: 2px;
    background: ${({ $color }) => $color};
`;

const Footnote = styled.p`
    margin: var(--space-1) 0 0;
    color: var(--neutral-400);
    font-size: var(--font-size-small);
`;

