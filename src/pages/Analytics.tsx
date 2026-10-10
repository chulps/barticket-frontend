import { useEffect, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError, getToken } from "../api/client";
import { ColumnChart, MeterChart, type ChartColumn, type ChartMeter } from "../components/AnalyticsCharts";
import TabGroup from "../components/TabGroup";
import { formatDuration, localeTag, readLocale, translate, useI18n, type Locale, type MessageKey } from "../i18n";

type Range = "all" | "month" | "day";

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

function formatDay(iso: string, locale: Locale) {
    return parseDate(iso).toLocaleDateString(localeTag(locale), {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function yen(amount: number) {
    return `¥${amount.toLocaleString()}`;
}

function average(total: number, count: number) {
    if (count === 0) return "—";
    return yen(Math.round(total / count));
}

function nightColumns(
    shifts: ShiftReport[],
    field: "paid_total" | "guest_count",
    locale: Locale,
): ChartColumn[] {
    return [...shifts]
        .sort((a, b) => a.business_date.localeCompare(b.business_date))
        .map((shift) => ({
            id: String(shift.id),
            label: parseDate(shift.business_date).toLocaleDateString(localeTag(locale), {
                month: "numeric",
                day: "numeric",
            }),
            value: shift[field],
            title:
                field === "paid_total"
                    ? `${formatDay(shift.business_date, locale)} · ${yen(shift.paid_total)}`
                    : `${formatDay(shift.business_date, locale)} · ${shift.guest_count}`,
        }));
}

function staffMeters(shifts: ShiftReport[], locale: Locale): (ChartMeter & { nights: number })[] {
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

function StaffChart({ shifts }: { shifts: ShiftReport[] }) {
    const { t, locale } = useI18n();
    const meters = staffMeters(shifts, locale);
    if (meters.length === 0) return <p>{t("noClockIns")}</p>;
    return (
        <MeterChart
            title={t("people")}
            meters={meters.map((person) => ({
                ...person,
                detail: `${t("nights")} ${person.nights}`,
            }))}
        />
    );
}

export default function Analytics() {
    const { t, locale } = useI18n();
    const [shifts, setShifts] = useState<ShiftReport[] | null>(null);
    const [account, setAccount] = useState<Account | null>(null);
    const [error, setError] = useState("");
    const [range, setRange] = useState<Range>("month");
    const [month, setMonth] = useState("");
    const [dayId, setDayId] = useState<number | null>(null);
    const signedIn = getToken() !== null;

    useEffect(() => {
        if (!signedIn) return;
        accountApi
            .me()
            .then((me) => {
                setAccount(me);
                if (me.role !== "manager") return;
                return accountApi.closedShifts().then((rows) => {
                    const ordered = [...rows].sort((a, b) => b.business_date.localeCompare(a.business_date));
                    setShifts(ordered);
                    const latest = ordered[0];
                    if (latest) {
                        setMonth(monthKey(latest.business_date));
                        setDayId(latest.id);
                    }
                });
            })
            .catch((err: unknown) => {
                setError(err instanceof ApiError ? err.message : translate(readLocale(), "couldNotLoadShifts"));
            });
    }, [signedIn]);

    const monthShifts = (shifts ?? []).filter((shift) => monthKey(shift.business_date) === month);
    const selected = (shifts ?? []).find((shift) => shift.id === dayId) ?? null;
    const visible =
        range === "all" ? (shifts ?? []) : range === "month" ? monthShifts : selected ? [selected] : [];
    const totals = summarize(visible);

    function showMonth(next: string) {
        setMonth(next);
        const inMonth = (shifts ?? []).filter((shift) => monthKey(shift.business_date) === next);
        setDayId(inMonth[0]?.id ?? null);
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
                            { id: "month", label: t("monthly") },
                            { id: "day", label: t("daily") },
                        ]}
                        activeTab={range}
                        onChange={setRange}
                    />
                    {range !== "all" ? (
                        <Navigator>
                            <button type="button" className="hollow secondary" onClick={() => showMonth(shiftMonth(month, -1))}>
                                {t("prev")}
                            </button>
                            <strong>{month ? formatMonth(month, locale) : t("noNightsYet")}</strong>
                            <button type="button" className="hollow secondary" onClick={() => showMonth(shiftMonth(month, 1))}>
                                {t("next")}
                            </button>
                        </Navigator>
                    ) : null}
                    {range === "day" ? (
                        <DayList>
                            {monthShifts.length === 0 ? <p>{t("noNightsThisMonth")}</p> : null}
                            {monthShifts.map((shift) => (
                                <DayButton
                                    key={shift.id}
                                    type="button"
                                    $active={shift.id === selected?.id}
                                    onClick={() => setDayId(shift.id)}
                                >
                                    {formatDay(shift.business_date, locale)}
                                </DayButton>
                            ))}
                        </DayList>
                    ) : null}
                    {visible.length === 0 ? <p>{t("noNightsInRange")}</p> : <Summary totals={totals} />}
                    {visible.length > 1 ? (
                        <ChartPair>
                            <ColumnChart title={t("revenueByNight")} columns={nightColumns(visible, "paid_total", locale)} />
                            <ColumnChart title={t("guestsByNight")} columns={nightColumns(visible, "guest_count", locale)} />
                        </ChartPair>
                    ) : null}
                    {visible.length > 0 ? (
                        <MeterChart
                            title={t("payments")}
                            meters={[
                                { id: "cash", label: t("cash"), value: totals.cash, display: yen(totals.cash), color: "var(--success-400)" },
                                { id: "card", label: t("card"), value: totals.card, display: yen(totals.card), color: "var(--royal-300)" },
                                { id: "other", label: t("other"), value: totals.other, display: yen(totals.other), color: "var(--neutral-300)" },
                                { id: "cover", label: t("cover"), value: totals.cover, display: yen(totals.cover), color: "var(--royal-200)" },
                            ]}
                        />
                    ) : null}
                    {range === "day" && selected ? (
                        <Card>
                            <h2>{formatDay(selected.business_date, locale)}</h2>
                            <p>
                                {t("manager")} {selected.opened_by}
                            </p>
                            <p>
                                {t("paidCancelled", { paid: selected.paid_count, cancelled: selected.cancelled_count })}
                            </p>
                        </Card>
                    ) : null}
                    {range === "day" && selected ? <StaffChart shifts={[selected]} /> : null}
                    {range !== "day" && visible.length > 0 ? (
                        <>
                            <MeterChart
                                title={t("byWeekday")}
                                meters={WEEKDAYS.map((label, index) => {
                                    const row = summarize(visible.filter((shift) => weekdayIndex(shift.business_date) === index));
                                    return {
                                        id: label,
                                        label: t(label),
                                        value: row.revenue,
                                        display: yen(row.revenue),
                                        detail: `${t("nights")} ${row.nights} · ${t("guests")} ${row.guests} · ${t("avgBill")} ${average(row.revenue, row.guests)}`,
                                    };
                                })}
                            />
                            <StaffChart shifts={visible} />
                        </>
                    ) : null}
                </>
            ) : null}
        </Page>
    );
}

function Summary({ totals }: { totals: Totals }) {
    const { t, locale } = useI18n();
    return (
        <Grid>
            <Stat>
                <label>{t("revenue")}</label>
                <strong>{yen(totals.revenue)}</strong>
            </Stat>
            <Stat>
                <label>{t("nights")}</label>
                <strong>{totals.nights}</strong>
            </Stat>
            <Stat>
                <label>{t("guests")}</label>
                <strong>{totals.guests}</strong>
            </Stat>
            <Stat>
                <label>{t("avgBill")}</label>
                <strong>{average(totals.revenue, totals.guests)}</strong>
            </Stat>
            <Stat>
                <label>{t("avgPerNight")}</label>
                <strong>{average(totals.revenue, totals.nights)}</strong>
            </Stat>
            <Stat>
                <label>{t("hours")}</label>
                <strong>{formatDuration(locale, totals.seconds)}</strong>
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
        </Grid>
    );
}


const Page = styled.main`
    padding: var(--space-2);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
`;

const Navigator = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-1);
`;

const Stat = styled.div`
    padding: var(--space-1);
    background: var(--neutral-900);
    border-radius: 12px;

    label {
        color: var(--neutral-400);
    }

    strong {
        display: block;
        margin-top: 4px;
    }
`;

const Card = styled.section`
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
`;

const ChartPair = styled.div`
    display: grid;
    gap: var(--space-2);

    @media (min-width: 768px) {
        grid-template-columns: 1fr 1fr;
    }
`;

const DayList = styled.div`
    display: flex;
    gap: var(--space-1);
    overflow-x: auto;
`;

const DayButton = styled.button<{ $active: boolean }>`
    white-space: nowrap;
    background: ${({ $active }) => ($active ? "var(--neutral-700)" : "var(--neutral-900)")};
    color: white;
`;
