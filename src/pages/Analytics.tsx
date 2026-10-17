import { useEffect, useState, type ReactNode } from "react";
import styled from "styled-components";
import RequestState from "../components/RequestState";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ticketsApi, toTicket } from "../api/tickets";
import { ApiError, getToken } from "../api/client";
import { listNotices, type NoticeList } from "../api/notices";
import { BarChart, DonutChart, HorizontalBarChart, CopyPanelButton, type TimeBar } from "../components/AnalyticsCharts";
import AnalyticsDatePicker from "../components/AnalyticsDatePicker";
import Icon from "../components/Icon";
import TabGroup from "../components/TabGroup";
import { formatDuration, localeTag, menuLabel, readLocale, translate, useI18n, type Locale, type MessageKey } from "../i18n";
import type { Ticket } from "../types/Ticket";
import { topSellingItems } from "../components/topSellingItems";
import GuestOccupancyChart from "../components/GuestOccupancyChart";
import { paymentAllocation, ticketCountsUnavailable } from "./analyticsLegacy";
import { analyticsDrillDownTarget, shiftDay, shiftMonth, shiftYear } from "./analyticsNavigation";
import { analyticsShiftOnDate, initialAnalyticsShift, liveAnalyticsShift } from "./analyticsCurrentShift";
import { groupAnalyticsTickets } from "./analyticsTicketGroups";
import { ticketDataForClipboard, ticketListDataForClipboard } from "./ticketDataExport";
import OpenShiftOverview from "./OpenShiftOverview";
import AnalyticsReportActions from "../components/AnalyticsReportActions";
import { createAnalyticsTextReport } from "./analyticsTextReport";

type Range = "all" | "year" | "month" | "day";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const satisfies readonly MessageKey[];

type Totals = {
    nights: number;
    revenue: number;
    cash: number;
    card: number;
    other: number;
    unknownPayment: number;
    missingTicketNights: number;
    cover: number;
    guests: number;
    paid: number;
    cancelled: number;
    seconds: number;
};

function emptyTotals(): Totals {
    return {
        nights: 0,
        revenue: 0,
        cash: 0,
        card: 0,
        other: 0,
        unknownPayment: 0,
        missingTicketNights: 0,
        cover: 0,
        guests: 0,
        paid: 0,
        cancelled: 0,
        seconds: 0,
    };
}

function addShift(totals: Totals, shift: ShiftReport) {
    totals.nights += 1;
    totals.revenue += shift.paid_total;
    const payment = paymentAllocation(shift);
    totals.cash += payment.cash;
    totals.card += payment.card;
    totals.other += payment.other;
    totals.unknownPayment += payment.unknown;
    if (ticketCountsUnavailable(shift)) totals.missingTicketNights += 1;
    totals.cover += shift.cover_total;
    totals.guests += shift.guest_count;
    totals.paid += shift.paid_count;
    totals.cancelled += shift.cancelled_count;
    totals.seconds += shift.staff_hours.reduce((sum, person) => sum + person.seconds, 0);
}

function summarize(shifts: ShiftReport[]): Totals {
    const totals = emptyTotals();
    shifts.forEach((shift) => addShift(totals, shift));
    return totals;
}

function parseDate(iso: string) {
    const [year, month, day] = iso.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function weekdayIndex(iso: string) {
    return (parseDate(iso).getDay() + 6) % 7;
}

function monthKey(iso: string) {
    return iso.slice(0, 7);
}

function yearKey(iso: string) {
    return iso.slice(0, 4);
}

function formatMonth(key: string, locale: Locale) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(localeTag(locale), {
        month: "long",
        year: "numeric",
    });
}

function formatNight(iso: string, locale: Locale) {
    const start = parseDate(iso);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    const tag = localeTag(locale);
    const weekday = start.toLocaleDateString(tag, { weekday: "short" });
    const startDay = start.getDate();
    const endDay = end.getDate();
    if (locale === "ja") {
        const startMonth = start.getMonth() + 1;
        const endLabel = start.getMonth() === end.getMonth() ? `${endDay}日` : `${end.getMonth() + 1}月${endDay}日`;
        return `${startMonth}月${startDay}日(${weekday})~${endLabel}`;
    }
    const month = start.toLocaleDateString(tag, { month: "short" });
    const endLabel = start.getMonth() === end.getMonth() ? String(endDay) : end.toLocaleDateString(tag, { month: "short", day: "numeric" });
    return `${weekday}, ${month} ${startDay}~${endLabel}`;
}

function yen(amount: number) {
    return `¥${amount.toLocaleString()}`;
}

function average(total: number, count: number) {
    if (count === 0) return "—";
    return yen(Math.round(total / count));
}

const CASH = "var(--success-400)";
const CARD = "var(--royal-400)";
const OTHER = "var(--neutral-300)";
const UNKNOWN = "#f59e0b"; // Warm orange for historical revenue with an unrecorded payment type.

type Point = {
    id: string;
    label: string;
    detailLabel: string;
    title: string;
    cash: number;
    card: number;
    other: number;
    unknownPayment: number;
    guests: number;
};

function chronological(shifts: ShiftReport[]) {
    return [...shifts].sort((a, b) => a.business_date.localeCompare(b.business_date));
}

function nightPoints(shifts: ShiftReport[], locale: Locale): Point[] {
    return chronological(shifts).map((shift) => ({
        id: String(shift.id),
        detailLabel: parseDate(shift.business_date).toLocaleDateString(localeTag(locale), { year: "numeric", month: "long", day: "numeric" }),
        label: parseDate(shift.business_date).toLocaleDateString(localeTag(locale), {
            month: "numeric",
            day: "numeric",
        }),
        title: `${formatNight(shift.business_date, locale)} · ${yen(shift.paid_total)} · ${shift.guest_count}`,
        ...paymentAllocation(shift),
        unknownPayment: paymentAllocation(shift).unknown,
        guests: shift.guest_count,
    }));
}

function monthPoints(shifts: ShiftReport[], locale: Locale): Point[] {
    const groups = new Map<string, ShiftReport[]>();
    chronological(shifts).forEach((shift) => {
        const key = monthKey(shift.business_date);
        groups.set(key, [...(groups.get(key) ?? []), shift]);
    });
    return [...groups.entries()].map(([key, rows]) => {
        const totals = summarize(rows);
        const label = parseDate(`${key}-01`).toLocaleDateString(localeTag(locale), {
            month: "short",
            year: "2-digit",
        });
        return {
            id: key,
            detailLabel: formatMonth(key, locale),
            label,
            title: `${formatMonth(key, locale)} · ${yen(totals.revenue)} · ${totals.guests}`,
            cash: totals.cash,
            card: totals.card,
            other: totals.other,
            unknownPayment: totals.unknownPayment,
            guests: totals.guests,
        };
    });
}

function yearPoints(shifts: ShiftReport[]): Point[] {
    const groups = new Map<string, ShiftReport[]>();
    chronological(shifts).forEach((shift) => {
        const key = yearKey(shift.business_date);
        groups.set(key, [...(groups.get(key) ?? []), shift]);
    });
    return [...groups.entries()].map(([key, rows]) => {
        const totals = summarize(rows);
        return {
            id: key,
            label: key,
            detailLabel: key,
            title: `${key} · ${yen(totals.revenue)} · ${totals.guests}`,
            cash: totals.cash,
            card: totals.card,
            other: totals.other,
            unknownPayment: totals.unknownPayment,
            guests: totals.guests,
        };
    });
}

function paymentBars(points: Point[]): TimeBar[] {
    return points.map((point) => ({
        id: point.id,
        label: point.label,
        title: point.title,
        detailLabel: point.detailLabel,
        segments: [
            { value: point.cash, color: CASH },
            { value: point.card, color: CARD },
            { value: point.other, color: OTHER },
            { value: point.unknownPayment, color: UNKNOWN },
        ],
    }));
}

function guestBars(points: Point[]): TimeBar[] {
    return points.map((point) => ({
        id: point.id,
        label: point.label,
        title: `${point.label} · ${point.guests}`,
        detailLabel: point.detailLabel,
        segments: [{ value: point.guests, color: "var(--royal-200)" }],
    }));
}

function compactYen(amount: number, locale: Locale) {
    if (amount === 0) return "¥0";
    if (locale === "ja" && amount >= 10000) {
        const man = amount / 10000;
        const text = Number.isInteger(man) ? String(man) : man.toFixed(1);
        return `¥${text}万`;
    }
    if (amount >= 1000000) return `¥${Number((amount / 1000000).toFixed(2))}M`;
    if (amount >= 1000) return `¥${Math.round(amount / 1000)}k`;
    return yen(amount);
}

function staffMeters(shifts: ShiftReport[], locale: Locale) {
    const people = new Map<number, { userId: number; name: string; seconds: number; nights: number }>();
    shifts.forEach((shift) => {
        const seen = new Set<number>();
        shift.staff_hours.forEach((person) => {
            const row = people.get(person.user_id) ?? {
                userId: person.user_id,
                name: person.name,
                seconds: 0,
                nights: 0,
            };
            row.seconds += person.seconds;
            if (!seen.has(person.user_id)) {
                row.nights += 1;
                seen.add(person.user_id);
            }
            people.set(person.user_id, row);
        });
    });
    return [...people.values()]
        .sort((a, b) => b.seconds - a.seconds)
        .map((person) => ({
            id: String(person.userId),
            label: person.name,
            value: person.seconds,
            display: formatDuration(locale, person.seconds),
            nights: person.nights,
        }));
}

function copyPeriod(range: Range, month: string, year: string, selected: ShiftReport | null, locale: Locale): string {
    if (range === "all") return locale === "ja" ? "全期間" : "All Time";
    if (range === "year") return year;
    if (range === "month") return month ? formatMonth(month, locale) : "";
    return selected ? formatNight(selected.business_date, locale) : "";
}

function RangeCharts({
    shifts,
    totals,
    range,
    context,
    onDrillDown,
}: {
    shifts: ShiftReport[];
    totals: Totals;
    range: Range;
    context: string;
    onDrillDown: (barId: string) => void;
}) {
    const { t, locale } = useI18n();
    const drillDownLabel = range === "all"
        ? (locale === "ja" ? "年別レポートを見る" : "View year report")
        : range === "year"
          ? (locale === "ja" ? "月別レポートを見る" : "View monthly report")
          : (locale === "ja" ? "日別レポートを見る" : "View daily report");
    const points = range === "all" ? yearPoints(shifts) : range === "year" ? monthPoints(shifts, locale) : nightPoints(shifts, locale);
    const averageRevenueSummary = {
        label: locale === "ja" ? "一晩の平均売上" : "Average Revenue / Night",
        value: yen(Math.round(totals.revenue / Math.max(totals.nights, 1))),
    };
    const weekdayBars: TimeBar[] = WEEKDAYS.map((label, index) => {
        const row = summarize(shifts.filter((shift) => weekdayIndex(shift.business_date) === index));
        const name = new Date(2024, 0, 1 + index).toLocaleDateString(localeTag(locale), { weekday: "short" });
        return {
            id: label,
            label: name,
            title: `${t(label)} · ${yen(row.revenue)} · ${row.guests}`,
            detailLabel: t(label),
            segments: [{ value: row.revenue, color: "var(--royal-400)" }],
        };
    });

    return (
        <Bento>
            <Cell $span={4}>
                <BarChart
                    title={range === "all" ? (locale === "ja" ? "年別売上" : "Revenue by Year") : range === "year" ? t("revenueByMonth") : t("revenueByNight")}
                    bars={paymentBars(points)}
                    copyContext={context}
                    onDrillDown={onDrillDown}
                    drillDownLabel={drillDownLabel}
                    summary={averageRevenueSummary}
                    formatTick={(value) => compactYen(value, locale)}
                    formatFull={(value) => yen(value)}
                    locale={locale}
                    chartHeight={220}
                    legend={[
                        { label: t("cash"), color: CASH, value: totals.cash },
                        { label: t("card"), color: CARD, value: totals.card },
                        { label: t("other"), color: OTHER, value: totals.other },
                        { label: locale === "ja" ? "支払方法未記録" : "Payment type not recorded", color: UNKNOWN, value: totals.unknownPayment },
                    ]}
                />
            </Cell>
            <Cell $span={2}>
                <BarChart
                    title={range === "all" ? (locale === "ja" ? "年別客数" : "Guests by Year") : range === "year" ? t("guestsByMonth") : t("guestsByNight")}
                    bars={guestBars(points)}
                    copyContext={context}
                    onDrillDown={onDrillDown}
                    drillDownLabel={drillDownLabel}
                    summary={{
                        label: locale === "ja" ? "平均客数" : "Average Guests",
                        value: String(Math.round(totals.guests / Math.max(totals.nights, 1))),
                    }}
                    formatTick={(value) => String(Math.round(value))}
                    formatFull={(value) => value.toLocaleString(localeTag(locale))}
                    locale={locale}
                    chartHeight={168}
                />
            </Cell>
            <Cell>
                <DonutChart
                    title={t("payments")}
                    center={yen(totals.revenue)}
                    copyContext={context}
                    locale={locale}
                    slices={[
                        { id: "cash", label: t("cash"), value: totals.cash, display: yen(totals.cash), color: CASH },
                        { id: "card", label: t("card"), value: totals.card, display: yen(totals.card), color: CARD },
                        { id: "other", label: t("other"), value: totals.other, display: yen(totals.other), color: OTHER },
                        { id: "unknown", label: locale === "ja" ? "未記録" : "Not recorded", value: totals.unknownPayment, display: yen(totals.unknownPayment), color: UNKNOWN },
                    ]}
                />
            </Cell>
            <Cell>
                {totals.missingTicketNights === shifts.length ? (
                    <MissingTicketsPanel context={context} missing={totals.missingTicketNights} />
                ) : <DonutChart
                    title={t("tickets")}
                    center={String(totals.paid + totals.cancelled)}
                    copyContext={context}
                    locale={locale}
                    slices={[
                        { id: "paid", label: t("paid"), value: totals.paid, display: String(totals.paid), color: "var(--success-400)" },
                        {
                            id: "cancelled",
                            label: t("cancelled"),
                            value: totals.cancelled,
                            display: String(totals.cancelled),
                            color: "var(--danger-400)",
                        },
                    ]}
                    note={totals.missingTicketNights > 0
                        ? (locale === "ja"
                            ? `一部の夜（${totals.missingTicketNights}件）はチケット数が未記録です。表示は記録済みの夜のみ。`
                            : `Ticket counts weren't recorded for ${totals.missingTicketNights} night(s). Showing recorded nights only.`)
                        : undefined}
                />}
            </Cell>
            <Cell $span={2}>
                <BarChart title={t("byWeekday")} bars={weekdayBars} copyContext={context} summary={averageRevenueSummary} formatTick={(value) => compactYen(value, locale)} formatFull={(value) => yen(value)} locale={locale} chartHeight={168} />
            </Cell>
            <Cell $span={2}>
                <StaffChart shifts={shifts} context={context} />
            </Cell>
        </Bento>
    );
}

function MissingTicketsPanel({ context, missing }: { context: string; missing: number }) {
    const { t, locale } = useI18n();
    const note = locale === "ja"
        ? `${missing}件の夜はチケット数（支払済み・キャンセル）が未記録です。`
        : `Paid and cancelled ticket counts weren't recorded for these ${missing} night(s).`;
    return (
        <MissingTicketsCard>
            <header>
                <h2>{t("tickets")}</h2>
                <CopyPanelButton locale={locale} text={`${context} → ${t("tickets")}: ${note}`} />
            </header>
            <strong>—</strong>
            <DataCaveat>{note}</DataCaveat>
        </MissingTicketsCard>
    );
}

const DataCaveat = styled.p`
    color: var(--neutral-400);
    font-size: var(--font-size-small);
    margin: var(--space-1) 0 0;
`;

const MissingTicketsCard = styled.section`
    background: var(--neutral-900);
    border-radius: 12px;
    padding: var(--space-2);
    min-height: 100%;
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-1); }
    h2 { font-size: var(--font-size-h5); font-weight: 500; }
    strong { display: block; font-size: var(--font-size-h3); margin-top: var(--space-2); }
`;

function StaffChart({ shifts, context }: { shifts: ShiftReport[]; context?: string }) {
    const { t, locale } = useI18n();
    const meters = staffMeters(shifts, locale);
    if (meters.length === 0) return <p>{t("noClockIns")}</p>;
    return (
        <HorizontalBarChart
            title={t("people")}
            copyContext={context}
            locale={locale}
            bars={meters.map((person) => ({
                id: person.id,
                label: person.label,
                value: person.value,
                display: person.display,
            }))}
        />
    );
}

function staffDrinkShifts(
    visible: ShiftReport[],
    openShift: ShiftReport | null,
    range: Range,
    month: string,
    year: string,
    pickedDate: string,
): ShiftReport[] {
    if (!openShift) return visible;
    const inRange =
        range === "all" ||
        (range === "year" && yearKey(openShift.business_date) === year) ||
        (range === "month" && monthKey(openShift.business_date) === month) ||
        (range === "day" && openShift.business_date === pickedDate);
    if (!inRange) return visible;
    return [openShift, ...visible.filter((shift) => shift.id !== openShift.id)];
}

export default function Analytics() {
    const { t, locale } = useI18n();
    const [shifts, setShifts] = useState<ShiftReport[] | null>(null);
    const [openShift, setOpenShift] = useState<ShiftReport | null>(null);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [account, setAccount] = useState<Account | null>(null);
    const [team, setTeam] = useState<Account[] | null>(null);
    const [notices, setNotices] = useState<NoticeList | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [clockNow, setClockNow] = useState<number | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [range, setRange] = useState<Range>("day");
    const [month, setMonth] = useState("");
    const [year, setYear] = useState("");
    const [dayId, setDayId] = useState<number | null>(null);
    const [pickedDate, setPickedDate] = useState("");
    const signedIn = getToken() !== null;

    useEffect(() => {
        const updateClock = () => setClockNow(Math.floor(Date.now() / 1000));
        updateClock();
        const timer = window.setInterval(updateClock, 10_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!signedIn) return;
        let cancelled = false;
        let initiallySelected = false;
        let latestRequest = 0;
        let timer: number | null = null;

        async function refresh() {
            const request = ++latestRequest;
            try {
                const [rows, current, ticketRows, stock] = await Promise.all([
                    accountApi.closedShifts(),
                    accountApi.currentShift(),
                    ticketsApi.list(),
                    listNotices().catch(() => null),
                ]);
                // Do not apply an old response after a more recent refresh.
                if (cancelled || request !== latestRequest) return;
                const ordered = [...rows].sort((a, b) => b.business_date.localeCompare(a.business_date));
                setShifts(ordered);
                setOpenShift(current);
                setTickets(ticketRows.map(toTicket));
                setNotices(stock);
                setLastUpdated(Math.floor(Date.now() / 1000));
                setError("");
                setLoading(false);

                // Set the default date only on the first successful response.
                // Background refreshes must not interrupt the date the user is viewing.
                if (!initiallySelected) {
                    initiallySelected = true;
                    const initial = initialAnalyticsShift(current, ordered);
                    if (initial) {
                        setMonth(monthKey(initial.business_date));
                        setYear(yearKey(initial.business_date));
                        setDayId(initial.id);
                        setPickedDate(initial.business_date);
                    }
                }
            } catch (err: unknown) {
                if (cancelled || request !== latestRequest) return;
                setLoading(false);
                if (err instanceof ApiError && err.status === 403) {
                    setError(readLocale() === "ja"
                        ? "分析データへのアクセスが許可されていません。バックエンドの閲覧権限を確認してください。"
                        : "Analytics access is not yet enabled by the backend. Please ask an administrator to check read permissions.");
                } else {
                    setError(err instanceof ApiError ? err.message : translate(readLocale(), "couldNotLoadShifts"));
                }
            }
        }

        async function start() {
            try {
                const me = await accountApi.me();
                if (cancelled) return;
                setAccount(me);
                // Staff can view analytics, but the user directory remains manager-only.
                if (me.role === "manager") {
                    void accountApi.listUsers()
                        .then((members) => { if (!cancelled) setTeam(members); })
                        .catch(() => { if (!cancelled) setTeam(null); });
                }

                // Refresh live totals, roster/punches and shift-close status
                // without requiring the manager to leave the Analytics page.
                window.addEventListener("focus", refresh);
                window.addEventListener("barticket-push", refresh);
                window.addEventListener("barticket-notices", refresh);
                window.addEventListener("barticket-api-restored", refresh);
                timer = window.setInterval(refresh, 20000);
                await refresh();
            } catch (err: unknown) {
                if (cancelled) return;
                setLoading(false);
                if (err instanceof ApiError && err.status === 403) {
                    setError(readLocale() === "ja"
                        ? "分析データへのアクセスが許可されていません。バックエンドの閲覧権限を確認してください。"
                        : "Analytics access is not yet enabled by the backend. Please ask an administrator to check read permissions.");
                } else {
                    setError(err instanceof ApiError ? err.message : translate(readLocale(), "couldNotLoadShifts"));
                }
            }
        }

        void start();
        return () => {
            cancelled = true;
            if (timer !== null) window.clearInterval(timer);
            window.removeEventListener("focus", refresh);
            window.removeEventListener("barticket-push", refresh);
            window.removeEventListener("barticket-notices", refresh);
            window.removeEventListener("barticket-api-restored", refresh);
        };
    }, [signedIn]);

    const monthShifts = (shifts ?? []).filter((shift) => monthKey(shift.business_date) === month);
    const yearShifts = (shifts ?? []).filter((shift) => yearKey(shift.business_date) === year);
    const currentReport = liveAnalyticsShift(openShift, tickets);
    const selected = currentReport?.id === dayId
        ? currentReport
        : (shifts ?? []).find((shift) => shift.id === dayId) ?? null;
    const visible =
        range === "all"
            ? (shifts ?? [])
            : range === "year"
              ? yearShifts
              : range === "month"
                ? monthShifts
                : selected
                  ? [selected]
                  : [];
    const totals = summarize(visible);
    // Keep staff drink data in generated text reports; remove only the on-screen panel.
    const staffShifts = staffDrinkShifts(visible, openShift, range, month, year, pickedDate);
    const soldItems = range === "day" && selected?.status === "open" ? [] :
        topSellingItems(tickets, new Set(visible.map((shift) => shift.id)));
    function reportText(reportLocale: Locale) {
        return createAnalyticsTextReport({
            range,
            label: copyPeriod(range, month, year, selected, reportLocale),
            locale: reportLocale,
            shifts: visible,
            totals,
            tickets,
            topItems: soldItems.map((item) => ({
                name: menuLabel(reportLocale, item.name), quantity: item.quantity, revenue: item.revenue,
            })),
            staffShifts,
            team,
            notices,
            updatedAt: lastUpdated,
        });
    }

    function showMonth(next: string) {
        setMonth(next);
        setYear(next.slice(0, 4));
        const inMonth = (shifts ?? []).filter((shift) => monthKey(shift.business_date) === next);
        const first = openShift && monthKey(openShift.business_date) === next ? openShift : inMonth[0];
        setDayId(first?.id ?? null);
        setPickedDate(first?.business_date ?? `${next}-01`);
    }

    function pickDate(iso: string) {
        setPickedDate(iso);
        setMonth(monthKey(iso));
        setYear(yearKey(iso));
        const match = analyticsShiftOnDate(iso, openShift, shifts ?? []);
        setDayId(match?.id ?? null);
    }

    function drillIntoBar(barId: string) {
        if (range === "day") return;
        const target = analyticsDrillDownTarget(range, barId, shifts ?? []);
        if (!target) return;
        if (target.range === "year") {
            setYear(target.key);
        } else if (target.range === "month") {
            showMonth(target.key);
        } else {
            pickDate(target.key);
            // A daily bar represents a specific shift ID, even if multiple
            // shifts happen to share one business date.
            setDayId(target.shiftId);
        }
        setRange(target.range);
    }

    return (
        <Page>
            <h1>{t("analytics")}</h1>
            {!signedIn ? <p>{t("signInForShifts")}</p> : null}
            {signedIn && loading && !shifts ? <RequestState kind="loading" detail={locale === "ja" ? "分析データを読み込み中…" : "Loading analytics…"} /> : null}
            {error ? <RequestState kind="error" detail={error} onRetry={() => window.location.reload()} /> : null}
            {account && shifts ? (
                <>
                    <TabGroup
                        tabs={[
                            { id: "all", label: t("allTime") },
                            { id: "year", label: t("year") },
                            { id: "month", label: t("monthly") },
                            { id: "day", label: t("daily") },
                        ]}
                        activeTab={range}
                        onChange={setRange}
                    />
                    {range === "year" ? (
                        <Navigator>
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("prev")}
                                disabled={!year}
                                onClick={() => year && setYear(shiftYear(year, -1))}
                            >
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <strong>{year || t("noNightsYet")}</strong>
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("next")}
                                disabled={!year}
                                onClick={() => year && setYear(shiftYear(year, 1))}
                            >
                                <Icon name="CaretRight" size="var(--font-size-h4)" />
                            </StepButton>
                        </Navigator>
                    ) : null}
                    {range === "month" ? (
                        <Navigator>
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("prev")}
                                disabled={!month}
                                onClick={() => month && showMonth(shiftMonth(month, -1))}
                            >
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <strong>{month ? formatMonth(month, locale) : t("noNightsYet")}</strong>
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("next")}
                                disabled={!month}
                                onClick={() => month && showMonth(shiftMonth(month, 1))}
                            >
                                <Icon name="CaretRight" size="var(--font-size-h4)" />
                            </StepButton>
                        </Navigator>
                    ) : null}
                    {range === "day" ? (
                        <DayNavigator>
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("prev")}
                                disabled={!pickedDate}
                                onClick={() => pickedDate && pickDate(shiftDay(pickedDate, -1))}
                            >
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <AnalyticsDatePicker
                                label={pickedDate ? formatNight(pickedDate, locale) : t("noNightsYet")}
                                value={pickedDate}
                                shiftDates={[...(shifts ?? []).map((shift) => shift.business_date), ...(openShift ? [openShift.business_date] : [])]}
                                onChange={pickDate}
                            />
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("next")}
                                disabled={!pickedDate}
                                onClick={() => pickedDate && pickDate(shiftDay(pickedDate, 1))}
                            >
                                <Icon name="CaretRight" size="var(--font-size-h4)" />
                            </StepButton>
                        </DayNavigator>
                    ) : null}
                    <AnalyticsReportActions
                        key={[range, month, year, range === "day" ? dayId : null].join(":")}
                        textEn={reportText("en")}
                        textJa={reportText("ja")}
                        locale={locale}
                    />
                    {range === "day" && selected?.status === "open" ? (
                        <>
                            <OpenShiftOverview
                                shift={selected}
                                tickets={tickets}
                                members={team}
                                notices={notices}
                                updatedAt={lastUpdated}
                                dateLabel={formatNight(selected.business_date, locale)}
                            />
                            <GuestOccupancyChart
                                shift={selected}
                                tickets={tickets}
                                now={lastUpdated ?? clockNow ?? selected.opened_at}
                                dateLabel={formatNight(selected.business_date, locale)}
                            />
                        </>
                    ) : (
                        <>
                            {visible.length === 0 ? <p>{t("noNightsInRange")}</p> : (
                                <Summary totals={totals} context={copyPeriod(range, month, year, selected, locale)}>
                                    {range !== "day" ? (
                                        <RangeCharts shifts={visible} totals={totals} range={range} context={copyPeriod(range, month, year, selected, locale)} onDrillDown={drillIntoBar} />
                                    ) : selected ? (
                                        <GuestOccupancyChart
                                            shift={selected}
                                            tickets={tickets}
                                            now={lastUpdated ?? clockNow ?? selected.opened_at}
                                            dateLabel={formatNight(selected.business_date, locale)}
                                        />
                                    ) : null}
                                </Summary>
                            )}
                    {range === "day" && selected ? (
                        <DayBento>
                            <Card>
                                <CopyPanelButton locale={locale} text={`${formatNight(selected.business_date, locale)} → ${t("manager")}: ${selected.opened_by}; ${ticketCountsUnavailable(selected) ? (locale === "ja" ? "チケット数は未記録" : "Ticket counts not recorded") : t("paidCancelled", { paid: selected.paid_count, cancelled: selected.cancelled_count })}`} />
                                <h2>{formatNight(selected.business_date, locale)}</h2>
                                <p>
                                    {t("manager")} {selected.opened_by}
                                </p>
                                <p>
                                    {ticketCountsUnavailable(selected) ? (locale === "ja" ? "チケット数は未記録" : "Ticket counts not recorded") : t("paidCancelled", { paid: selected.paid_count, cancelled: selected.cancelled_count })}
                                </p>
                            </Card>
                            <StaffChart shifts={[selected]} context={copyPeriod(range, month, year, selected, locale)} />
                        </DayBento>
                    ) : null}
                    {range === "day" && visible.length > 0 ? <Stockouts shifts={visible} /> : null}
                    {visible.length > 0 ? <TopSellingPanel shifts={visible} tickets={tickets} context={copyPeriod(range, month, year, selected, locale)} /> : null}
                    {visible.length > 0 ? <ShiftTickets shifts={visible} tickets={tickets} /> : null}
                        </>
                    )}
                </>
            ) : null}
        </Page>
    );
}

function TopSellingPanel({ shifts, tickets, context }: { shifts: ShiftReport[]; tickets: Ticket[]; context: string }) {
    const { locale } = useI18n();
    const heading = locale === "ja" ? "売上数量 TOP 3" : "Top 3 Selling Items";
    const rows = topSellingItems(tickets, new Set(shifts.map(shift => shift.id)));
    const quantityLabel = locale === "ja" ? "杯数" : "Units";
    const revenueLabel = locale === "ja" ? "売上" : "Revenue";
    const noItems = locale === "ja" ? "この期間に販売された商品はありません" : "No sold items for this period";
    const copy = [`${context} → ${heading}`,
        ...rows.map((row, i) => `${i + 1}. ${menuLabel(locale, row.name)} · ${row.quantity} · ${yen(row.revenue)}`),
    ].join("\\n");
    return (
        <TopSellingCard>
            <header>
                <div><h2>{heading}</h2><small>{context} · {quantityLabel}</small></div>
                <CopyPanelButton locale={locale} text={copy} />
            </header>
            {rows.length === 0 ? <p>{noItems}</p> : (
                <TopSellingList>
                    {rows.map((row, index) => (
                        <li key={row.id}>
                            <span className="rank">{index + 1}</span>
                            <span className="drink">{menuLabel(locale, row.name)}</span>
                            <span className="numbers"><strong>{row.quantity.toLocaleString(localeTag(locale))}</strong><small>{quantityLabel}</small></span>
                            <span className="numbers"><strong>{yen(row.revenue)}</strong><small>{revenueLabel}</small></span>
                        </li>
                    ))}
                </TopSellingList>
            )}
        </TopSellingCard>
    );
}

const TopSellingCard = styled.section`
    background: var(--neutral-900);
    border-radius: 12px;
    padding: var(--space-2);
    margin-top: var(--space-2);
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-2); }
    header h2 { margin: 0; }
    header small { color: var(--neutral-400); }
`;

const TopSellingList = styled.ol`
    padding: 0;
    margin: 0;
    list-style: none;
    display: grid;
    gap: var(--space-1);
    li { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto auto; gap: var(--space-2); align-items: center;
        padding: var(--space-2); border: 1px solid var(--neutral-700); border-radius: 8px; }
    .rank { font-weight: 700; font-size: 1.25rem; color: var(--royal-300); }
    .drink { min-width: 0; overflow-wrap: anywhere; }
    .numbers { text-align: right; display: flex; flex-direction: column; gap: 2px; white-space: nowrap; }
    .numbers small { color: var(--neutral-400); }
    @media (max-width: 460px) {
        li { grid-template-columns: 1.5rem minmax(0, 1fr) auto; gap: var(--space-1); }
        li .numbers:last-child { grid-column: 2 / -1; text-align: left; flex-direction: row; gap: var(--space-1); align-items: baseline; }
    }
`;

function Stockouts({ shifts }: { shifts: ShiftReport[] }) {
    const { t, locale } = useI18n();
    const rows = shifts.flatMap((shift) =>
        (shift.stockouts ?? []).map((row) => ({
            ...row,
            shiftId: shift.id,
            night: shift.business_date,
        })),
    );
    if (rows.length === 0) return null;
    return (
        <Card>
            <CopyPanelButton locale={locale} text={`${t("ranOut")}: ${rows.map(row => `${formatNight(row.night, locale)} · ${t("stockoutLine", { name: row.by, item: menuLabel(locale, row.item) })}`).join("; ")}`} />
            <AlertTitle>{t("ranOut")}</AlertTitle>
            {rows.map((row) => (
                <AlertLine key={`${row.shiftId}-${row.item}-${row.at}`}>
                    {formatNight(row.night, locale)} · {t("stockoutLine", { name: row.by, item: menuLabel(locale, row.item) })}
                </AlertLine>
            ))}
        </Card>
    );
}

function ShiftTickets({ shifts, tickets }: { shifts: ShiftReport[]; tickets: Ticket[] }) {
    const { t, locale } = useI18n();
    const [openId, setOpenId] = useState<number | null>(null);
    const dates = new Map(shifts.map((shift) => [shift.id, shift.business_date]));
    const groups = groupAnalyticsTickets(tickets, dates);
    const sections = [
        { id: "paid", title: t("paid"), rows: groups.paid },
        { id: "cancelled", title: t("cancelled"), rows: groups.cancelled },
    ] as const;
    const missingNights = shifts.filter(ticketCountsUnavailable).length;
    const count = groups.paid.length + groups.cancelled.length;
    const ticketDataLabel = locale === "ja" ? "チケットデータをコピー" : "Copy ticket data";
    const paidTicketDataLabel = locale === "ja" ? "支払済みチケットデータをコピー" : "Copy all paid ticket data";

    return (
        <TicketLog>
            <h2>{t("tickets")}</h2>
            {missingNights > 0 ? (
                <DataCaveat>{locale === "ja"
                    ? `${missingNights}件の過去の夜は個別のチケット履歴が未記録です。`
                    : `Individual ticket records weren't kept for ${missingNights} historical night(s).`}</DataCaveat>
            ) : null}
            {count === 0 && missingNights === 0 ? <p>{t("noTicketsInRange")}</p> : null}
            {count > 0 ? sections.map((section) => (
                <TicketStatusGroup key={section.id} aria-label={section.title}>
                    <TicketStatusHeading>
                        <h3>{section.title}</h3>
                        <span aria-label={`${section.title}: ${section.rows.length}`}>{section.rows.length}</span>
                        {section.id === "paid" ? (
                            <CopyPanelButton
                                text={JSON.stringify(ticketListDataForClipboard(groups.paid, dates), null, 2)}
                                locale={locale}
                                label={paidTicketDataLabel}
                            />
                        ) : null}
                    </TicketStatusHeading>
                    {section.rows.map((ticket) => {
                        const date = dates.get(ticket.shiftId ?? 0);
                        const total = ticket.items.reduce((sum, item) => sum + item.subtotal, 0);
                        const detail = ticket.status === "paid"
                            ? t(ticket.payment?.type ?? "paid")
                            : t("cancelled");
                        const open = openId === ticket.id;
                        return (
                            <TicketCard key={ticket.id}>
                                <TicketCardHeader>
                                    <TicketRow
                                        type="button"
                                        aria-expanded={open}
                                        onClick={() => setOpenId(open ? null : ticket.id)}
                                    >
                                        <span>
                                            <span>{ticket.name || `#${ticket.id}`}</span>
                                            <small>
                                                {date ? formatNight(date, locale) : ""}
                                                {date ? " · " : ""}
                                                {detail}
                                            </small>
                                        </span>
                                        <span>
                                            <strong>{yen(total)}</strong>
                                            <Icon name={open ? "CaretDown" : "CaretRight"} size="1.6rem" />
                                        </span>
                                    </TicketRow>
                                    <CopyPanelButton
                                        text={JSON.stringify(ticketDataForClipboard(ticket, date ?? null), null, 2)}
                                        locale={locale}
                                        label={ticketDataLabel}
                                    />
                                </TicketCardHeader>
                                {open ? (
                                    <ItemList>
                                        {ticket.items.map((item) => (
                                            <li key={item.id}>
                                                <span>{item.type === "cover" ? t("coverCharge") : menuLabel(locale, item.name)}</span>
                                                <data>{item.quantity}</data>
                                                <strong>{yen(item.subtotal)}</strong>
                                            </li>
                                        ))}
                                    </ItemList>
                                ) : null}
                            </TicketCard>
                        );
                    })}
                </TicketStatusGroup>
            )) : null}
        </TicketLog>
    );
}

function Summary({ totals, context, children }: { totals: Totals; context: string; children: ReactNode }) {
    const { t, locale } = useI18n();
    const allPaymentTypesMissing = totals.unknownPayment > 0 &&
        totals.cash + totals.card + totals.other === 0;
    const knownPayment = (amount: number) => allPaymentTypesMissing ? "—" : yen(amount);
    return (
        <>
        <Grid>
            <Stat $lead>
                <StatHeader>

                    <label>{t("revenue")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("revenue")}: ${yen(totals.revenue)}`} />

                </StatHeader>
                <strong>{yen(totals.revenue)}</strong>
            </Stat>
            <Stat $lead>
                <StatHeader>

                    <label>{t("guests")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("guests")}: ${totals.guests}`} />

                </StatHeader>
                <strong>{totals.guests}</strong>
            </Stat>
        </Grid>
        {children}
        <Grid>
            <Stat>
                <StatHeader>

                    <label>{t("cash")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("cash")}: ${knownPayment(totals.cash)}`} />

                </StatHeader>
                <strong>{knownPayment(totals.cash)}</strong>
            </Stat>
            <Stat>
                <StatHeader>

                    <label>{t("card")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("card")}: ${knownPayment(totals.card)}`} />

                </StatHeader>
                <strong>{knownPayment(totals.card)}</strong>
            </Stat>
            <Stat>
                <StatHeader>

                    <label>{t("other")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("other")}: ${knownPayment(totals.other)}`} />

                </StatHeader>
                <strong>{knownPayment(totals.other)}</strong>
            </Stat>
            {totals.unknownPayment > 0 ? (
                <Stat>
                    <StatHeader>
                        <label>{locale === "ja" ? "支払方法未記録" : "Payment type not recorded"}</label>
                        <CopyPanelButton locale={locale} text={`${context} → ${locale === "ja" ? "支払方法未記録" : "Payment type not recorded"}: ${yen(totals.unknownPayment)}`} />
                    </StatHeader>
                    <strong>{yen(totals.unknownPayment)}</strong>
                </Stat>
            ) : null}
            <Stat>
                <StatHeader>

                    <label>{t("cover")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("cover")}: ${yen(totals.cover)}`} />

                </StatHeader>
                <strong>{yen(totals.cover)}</strong>
            </Stat>
            <Stat>
                <StatHeader>

                    <label>{t("avgBill")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("avgBill")}: ${average(totals.revenue, totals.guests)}`} />

                </StatHeader>
                <strong>{average(totals.revenue, totals.guests)}</strong>
            </Stat>
            <Stat>
                <StatHeader>

                    <label>{t("nights")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("nights")}: ${totals.nights}`} />

                </StatHeader>
                <strong>{totals.nights}</strong>
            </Stat>
            <Stat>
                <StatHeader>

                    <label>{t("avgPerNight")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("avgPerNight")}: ${average(totals.revenue, totals.nights)}`} />

                </StatHeader>
                <strong>{average(totals.revenue, totals.nights)}</strong>
            </Stat>
            <Stat>
                <StatHeader>

                    <label>{t("hours")}</label>

                    <CopyPanelButton locale={locale} text={`${context} → ${t("hours")}: ${formatDuration(locale, totals.seconds)}`} />

                </StatHeader>
                <strong>{formatDuration(locale, totals.seconds)}</strong>
            </Stat>
        </Grid>
        </>
    );
}


const Page = styled.main`
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);

    @media (max-width: 768px) {
        padding-inline: calc(var(--space-2) / 2);
    }
`;

const Navigator = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
`;

const StepButton = styled.button`
    && {
        padding-inline: 1em;
    }
`;

const DayNavigator = styled(Navigator)`
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    justify-items: center;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-1);

    @media (min-width: 720px) {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
`;

const Stat = styled.div<{ $lead?: boolean }>`
    position: relative;
    padding: ${({ $lead }) => ($lead ? "var(--space-2)" : "var(--space-1)")};
    background: var(--neutral-900);
    border-radius: 12px;
    min-width: 0;
    grid-column: ${({ $lead }) => ($lead ? "span 2" : "auto")};

    label {
        color: var(--neutral-400);
        font-size: var(--font-size-small);
    }

    strong {
        display: block;
        margin-top: 2px;
        font-family: var(--font-family-data);
        font-size: ${({ $lead }) => ($lead ? "var(--font-size-h3)" : "var(--font-size-h5)")};
        font-weight: 500;
    }
`;

const StatHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-1);
    min-width: 0;

    label { min-width: 0; }
`;

const Bento = styled.div`
    display: grid;
    gap: var(--space-1);
    grid-template-columns: minmax(0, 1fr);

    @media (min-width: 840px) {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
`;

const Cell = styled.div<{ $span?: number }>`
    min-width: 0;

    @media (min-width: 840px) {
        grid-column: span ${({ $span }) => $span ?? 1};
    }
`;

const TicketLog = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    h2 {
        font-size: var(--font-size-h5);
        font-weight: 500;
    }

    small {
        display: block;
        color: var(--neutral-400);
    }
`;

const TicketStatusGroup = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
`;

const TicketStatusHeading = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-top: var(--space-1);
    padding-bottom: var(--space-0);
    border-bottom: 1px solid var(--neutral-700);

    h3 {
        margin: 0;
        font-size: var(--font-size-default);
        font-weight: 500;
    }

    span {
        font-family: var(--font-family-data);
        color: var(--neutral-400);
        font-size: var(--font-size-small);
    }

    > span:last-child {
        margin-left: auto;
    }
`;

const TicketCard = styled.div`
    background: var(--neutral-900);
    border-radius: 12px;
    min-width: 0;
`;

const TicketCardHeader = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-0);
    padding-right: var(--space-1);
`;

const TicketRow = styled.button`
    width: auto;
    flex: 1;
    min-width: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1);
    background: transparent;
    color: inherit;
    border: none;
    border-radius: 12px;
    text-align: left;
    white-space: normal;
    font-size: var(--font-size-default);

    &:hover,
    &:active {
        background: var(--neutral-800);
        transform: none;
        filter: none;
    }

    > span {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        min-width: 0;
    }

    > span:first-child {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
    }

    span {
        overflow-wrap: anywhere;
    }

    strong {
        font-family: var(--font-family-data);
        font-weight: 500;
        white-space: nowrap;
    }
`;

const ItemList = styled.ul`
    list-style: none;
    margin: 0;
    padding: 0 var(--space-1) var(--space-1);
    display: flex;
    flex-direction: column;
    gap: var(--space-0);

    li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: var(--space-1);
        align-items: baseline;
        padding-top: var(--space-0);
        border-top: 1px solid var(--neutral-800);
    }

    span {
        overflow-wrap: anywhere;
    }

    data,
    strong {
        font-family: var(--font-family-data);
        font-weight: 500;
        white-space: nowrap;
    }
`;

const DayBento = styled.div`
    display: grid;
    gap: var(--space-1);
    align-items: start;

    @media (min-width: 840px) {
        grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
    }
`;

const AlertTitle = styled.h2`
    color: var(--danger-400);
`;

const AlertLine = styled.p`
    margin: 0;
    color: var(--danger-400);
`;

const Card = styled.section`
    position: relative;
    > span:has(> button):first-child { position: absolute; top: var(--space-0); right: var(--space-0); }
    > h2, > p:first-of-type { padding-right: var(--space-3); }
    padding: var(--space-1);
    background: var(--neutral-900);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: var(--space-0);

    h2 {
        font-size: var(--font-size-h5);
        line-height: 1.2;
        font-weight: 500;
    }
`;

