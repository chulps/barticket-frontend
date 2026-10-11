import { useEffect, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ticketsApi, toTicket } from "../api/tickets";
import { ApiError, getToken } from "../api/client";
import { BarChart, DonutChart, HorizontalBarChart, type TimeBar } from "../components/AnalyticsCharts";
import AnalyticsDatePicker from "../components/AnalyticsDatePicker";
import Icon from "../components/Icon";
import TabGroup from "../components/TabGroup";
import { formatDuration, localeTag, menuLabel, readLocale, translate, useI18n, type Locale, type MessageKey } from "../i18n";
import type { Ticket } from "../types/Ticket";

type Range = "all" | "year" | "month" | "day";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const satisfies readonly MessageKey[];

type Totals = {
    nights: number;
    revenue: number;
    cash: number;
    card: number;
    other: number;
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
    totals.cash += shift.cash_total;
    totals.card += shift.card_total;
    totals.other += shift.other_total;
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

function shiftYear(year: string, delta: number) {
    return String(Number(year) + delta);
}

function shiftMonth(key: string, delta: number) {
    const [year, month] = key.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
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

type Point = {
    id: string;
    label: string;
    detailLabel: string;
    title: string;
    cash: number;
    card: number;
    other: number;
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
        cash: shift.cash_total,
        card: shift.card_total,
        other: shift.other_total,
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

function RangeCharts({
    shifts,
    totals,
    range,
}: {
    shifts: ShiftReport[];
    totals: Totals;
    range: Range;
}) {
    const { t, locale } = useI18n();
    const points = range === "all" || range === "year" ? monthPoints(shifts, locale) : nightPoints(shifts, locale);
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
                    title={range === "all" || range === "year" ? t("revenueByMonth") : t("revenueByNight")}
                    bars={paymentBars(points)}
                    formatTick={(value) => compactYen(value, locale)}
                    formatFull={(value) => yen(value)}
                    locale={locale}
                    chartHeight={220}
                    legend={[
                        { label: t("cash"), color: CASH },
                        { label: t("card"), color: CARD },
                        { label: t("other"), color: OTHER },
                    ]}
                />
            </Cell>
            <Cell $span={2}>
                <BarChart
                    title={range === "all" || range === "year" ? t("guestsByMonth") : t("guestsByNight")}
                    bars={guestBars(points)}
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
                    slices={[
                        { id: "cash", label: t("cash"), value: totals.cash, display: yen(totals.cash), color: CASH },
                        { id: "card", label: t("card"), value: totals.card, display: yen(totals.card), color: CARD },
                        { id: "other", label: t("other"), value: totals.other, display: yen(totals.other), color: OTHER },
                    ]}
                />
            </Cell>
            <Cell>
                <DonutChart
                    title={t("tickets")}
                    center={String(totals.paid + totals.cancelled)}
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
                />
            </Cell>
            <Cell $span={2}>
                <BarChart title={t("byWeekday")} bars={weekdayBars} formatTick={(value) => compactYen(value, locale)} formatFull={(value) => yen(value)} locale={locale} chartHeight={168} />
            </Cell>
            <Cell $span={2}>
                <StaffChart shifts={shifts} />
            </Cell>
        </Bento>
    );
}

function StaffChart({ shifts }: { shifts: ShiftReport[] }) {
    const { t, locale } = useI18n();
    const meters = staffMeters(shifts, locale);
    if (meters.length === 0) return <p>{t("noClockIns")}</p>;
    return (
        <HorizontalBarChart
            title={t("people")}
            bars={meters.map((person) => ({
                id: person.id,
                label: person.label,
                value: person.value,
                display: person.display,
            }))}
        />
    );
}

export default function Analytics() {
    const { t, locale } = useI18n();
    const [shifts, setShifts] = useState<ShiftReport[] | null>(null);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [account, setAccount] = useState<Account | null>(null);
    const [error, setError] = useState("");
    const [range, setRange] = useState<Range>("month");
    const [month, setMonth] = useState("");
    const [year, setYear] = useState("");
    const [dayId, setDayId] = useState<number | null>(null);
    const [pickedDate, setPickedDate] = useState("");
    const signedIn = getToken() !== null;

    useEffect(() => {
        if (!signedIn) return;
        accountApi
            .me()
            .then((me) => {
                setAccount(me);
                if (me.role !== "manager") return;
                return Promise.all([accountApi.closedShifts(), ticketsApi.list()]).then(([rows, ticketRows]) => {
                    const ordered = [...rows].sort((a, b) => b.business_date.localeCompare(a.business_date));
                    setShifts(ordered);
                    setTickets(ticketRows.map(toTicket));
                    const latest = ordered[0];
                    if (latest) {
                        setMonth(monthKey(latest.business_date));
                        setYear(yearKey(latest.business_date));
                        setDayId(latest.id);
                        setPickedDate(latest.business_date);
                    }
                });
            })
            .catch((err: unknown) => {
                setError(err instanceof ApiError ? err.message : translate(readLocale(), "couldNotLoadShifts"));
            });
    }, [signedIn]);

    const monthShifts = (shifts ?? []).filter((shift) => monthKey(shift.business_date) === month);
    const yearShifts = (shifts ?? []).filter((shift) => yearKey(shift.business_date) === year);
    const selected = (shifts ?? []).find((shift) => shift.id === dayId) ?? null;
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

    function showMonth(next: string) {
        setMonth(next);
        const inMonth = (shifts ?? []).filter((shift) => monthKey(shift.business_date) === next);
        const first = inMonth[0];
        setDayId(first?.id ?? null);
        setPickedDate(first?.business_date ?? `${next}-01`);
    }

    function pickDate(iso: string) {
        setPickedDate(iso);
        setMonth(monthKey(iso));
        const match = (shifts ?? []).find((shift) => shift.business_date === iso);
        setDayId(match?.id ?? null);
    }

    return (
        <Page>
            <h1>{t("analytics")}</h1>
            {!signedIn ? <p>{t("signInForShifts")}</p> : null}
            {account && account.role !== "manager" ? <p>{t("managersOnly")}</p> : null}
            {error ? <p>{error}</p> : null}
            {account?.role === "manager" && shifts ? (
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
                                onClick={() => year && setYear(shiftYear(year, -1))}
                            >
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <strong>{year || t("noNightsYet")}</strong>
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("next")}
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
                                onClick={() => showMonth(shiftMonth(month, -1))}
                            >
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <strong>{month ? formatMonth(month, locale) : t("noNightsYet")}</strong>
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("next")}
                                onClick={() => showMonth(shiftMonth(month, 1))}
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
                                onClick={() => showMonth(shiftMonth(month, -1))}
                            >
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <AnalyticsDatePicker
                                label={pickedDate ? formatNight(pickedDate, locale) : t("noNightsYet")}
                                value={pickedDate}
                                shiftDates={(shifts ?? []).map((shift) => shift.business_date)}
                                onChange={pickDate}
                            />
                            <StepButton
                                type="button"
                                className="hollow secondary"
                                aria-label={t("next")}
                                onClick={() => showMonth(shiftMonth(month, 1))}
                            >
                                <Icon name="CaretRight" size="var(--font-size-h4)" />
                            </StepButton>
                        </DayNavigator>
                    ) : null}
                    {visible.length === 0 ? <p>{t("noNightsInRange")}</p> : <Summary totals={totals} />}
                    {range !== "day" && visible.length > 0 ? (
                        <RangeCharts shifts={visible} totals={totals} range={range} />
                    ) : null}
                    {range === "day" && selected ? (
                        <DayBento>
                            <Card>
                                <h2>{formatNight(selected.business_date, locale)}</h2>
                                <p>
                                    {t("manager")} {selected.opened_by}
                                </p>
                                <p>
                                    {t("paidCancelled", { paid: selected.paid_count, cancelled: selected.cancelled_count })}
                                </p>
                            </Card>
                            <StaffChart shifts={[selected]} />
                        </DayBento>
                    ) : null}
                    {range === "day" && visible.length > 0 ? <Stockouts shifts={visible} /> : null}
                    {visible.length > 0 ? <ShiftTickets shifts={visible} tickets={tickets} /> : null}
                </>
            ) : null}
        </Page>
    );
}

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
    const rows = tickets
        .filter((ticket) => ticket.shiftId !== null && dates.has(ticket.shiftId) && ticket.status !== "open")
        .sort((a, b) => {
            const byDate = (dates.get(a.shiftId ?? 0) ?? "").localeCompare(dates.get(b.shiftId ?? 0) ?? "");
            return byDate || a.id - b.id;
        });

    return (
        <TicketLog>
            <h2>{t("tickets")}</h2>
            {rows.length === 0 ? <p>{t("noTicketsInRange")}</p> : null}
            {rows.map((ticket) => {
                const date = dates.get(ticket.shiftId ?? 0);
                const total = ticket.items.reduce((sum, item) => sum + item.subtotal, 0);
                const detail =
                    ticket.status === "paid"
                        ? t(ticket.payment?.type ?? "paid")
                        : t("cancelled");
                const open = openId === ticket.id;
                return (
                    <TicketCard key={ticket.id}>
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
        </TicketLog>
    );
}

function Summary({ totals }: { totals: Totals }) {
    const { t, locale } = useI18n();
    return (
        <Grid>
            <Stat $lead>
                <label>{t("revenue")}</label>
                <strong>{yen(totals.revenue)}</strong>
            </Stat>
            <Stat $lead>
                <label>{t("guests")}</label>
                <strong>{totals.guests}</strong>
            </Stat>
            <Stat>
                <label>{t("cash")}</label>
                <strong>{yen(totals.cash)}</strong>
            </Stat>
            <Stat>
                <label>{t("card")}</label>
                <strong>{yen(totals.card)}</strong>
            </Stat>
            <Stat>
                <label>{t("other")}</label>
                <strong>{yen(totals.other)}</strong>
            </Stat>
            <Stat>
                <label>{t("cover")}</label>
                <strong>{yen(totals.cover)}</strong>
            </Stat>
            <Stat>
                <label>{t("avgBill")}</label>
                <strong>{average(totals.revenue, totals.guests)}</strong>
            </Stat>
            <Stat>
                <label>{t("nights")}</label>
                <strong>{totals.nights}</strong>
            </Stat>
            <Stat>
                <label>{t("avgPerNight")}</label>
                <strong>{average(totals.revenue, totals.nights)}</strong>
            </Stat>
            <Stat>
                <label>{t("hours")}</label>
                <strong>{formatDuration(locale, totals.seconds)}</strong>
            </Stat>
        </Grid>
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
        font-size: ${({ $lead }) => ($lead ? "var(--font-size-h4)" : "var(--font-size-h5)")};
        font-weight: 500;
    }
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

const TicketCard = styled.div`
    background: var(--neutral-900);
    border-radius: 12px;
    min-width: 0;
`;

const TicketRow = styled.button`
    width: 100%;
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

