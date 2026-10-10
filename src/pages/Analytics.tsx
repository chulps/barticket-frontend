import { useEffect, useState } from "react";
import styled from "styled-components";

import { accountApi, type Account, type ShiftReport } from "../api/account";
import { ApiError, getToken } from "../api/client";
import TabGroup from "../components/TabGroup";

type Range = "all" | "month" | "day";

const TABS: { id: Range; label: string }[] = [
    { id: "all", label: "All time" },
    { id: "month", label: "Monthly" },
    { id: "day", label: "Daily" },
];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

function formatMonth(key: string) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
    });
}

function formatDay(iso: string) {
    return parseDate(iso).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function yen(amount: number) {
    return `¥${amount.toLocaleString()}`;
}

function hours(seconds: number) {
    const whole = Math.round(seconds / 60);
    return `${Math.floor(whole / 60)}h ${whole % 60}m`;
}

function average(total: number, count: number) {
    if (count === 0) return "—";
    return yen(Math.round(total / count));
}

export default function Analytics() {
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
                setError(err instanceof ApiError ? err.message : "Could not load shifts");
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
            <h1>Analytics</h1>
            {!signedIn ? <p>Sign in from the account page to see past shifts.</p> : null}
            {account && account.role !== "manager" ? <p>Managers only.</p> : null}
            {error ? <p>{error}</p> : null}
            {account?.role === "manager" && shifts ? (
                <>
                    <TabGroup tabs={TABS} activeTab={range} onChange={setRange} />
                    {range !== "all" ? (
                        <Navigator>
                            <button type="button" className="hollow secondary" onClick={() => showMonth(shiftMonth(month, -1))}>
                                Prev
                            </button>
                            <strong>{month ? formatMonth(month) : "No nights yet"}</strong>
                            <button type="button" className="hollow secondary" onClick={() => showMonth(shiftMonth(month, 1))}>
                                Next
                            </button>
                        </Navigator>
                    ) : null}
                    {range === "day" ? (
                        <DayList>
                            {monthShifts.length === 0 ? <p>No closed nights this month.</p> : null}
                            {monthShifts.map((shift) => (
                                <DayButton
                                    key={shift.id}
                                    type="button"
                                    $active={shift.id === selected?.id}
                                    onClick={() => setDayId(shift.id)}
                                >
                                    {formatDay(shift.business_date)}
                                </DayButton>
                            ))}
                        </DayList>
                    ) : null}
                    {visible.length === 0 ? <p>No closed nights in this range.</p> : <Summary totals={totals} />}
                    {range === "day" && selected ? (
                        <Card>
                            <h2>{formatDay(selected.business_date)}</h2>
                            <p>Manager {selected.opened_by}</p>
                            <p>
                                {selected.paid_count} paid · {selected.cancelled_count} cancelled
                            </p>
                            <People hoursList={selected.staff_hours} />
                        </Card>
                    ) : null}
                    {range !== "day" && visible.length > 0 ? (
                        <>
                            <Card>
                                <h2>By weekday</h2>
                                {WEEKDAYS.map((label, index) => {
                                    const onDay = visible.filter((shift) => weekdayIndex(shift.business_date) === index);
                                    const row = summarize(onDay);
                                    return (
                                        <Row key={label}>
                                            <span>{label}</span>
                                            <span>
                                                {row.nights} nights · {yen(row.revenue)} · {row.guests} guests · avg{" "}
                                                {average(row.revenue, row.guests)}
                                            </span>
                                        </Row>
                                    );
                                })}
                            </Card>
                            <Card>
                                <h2>People</h2>
                                <PeopleHours shifts={visible} />
                            </Card>
                        </>
                    ) : null}
                </>
            ) : null}
        </Page>
    );
}

function Summary({ totals }: { totals: Totals }) {
    return (
        <Grid>
            <Stat>
                <label>Revenue</label>
                <strong>{yen(totals.revenue)}</strong>
            </Stat>
            <Stat>
                <label>Nights</label>
                <strong>{totals.nights}</strong>
            </Stat>
            <Stat>
                <label>Guests</label>
                <strong>{totals.guests}</strong>
            </Stat>
            <Stat>
                <label>Avg bill</label>
                <strong>{average(totals.revenue, totals.guests)}</strong>
            </Stat>
            <Stat>
                <label>Avg / night</label>
                <strong>{average(totals.revenue, totals.nights)}</strong>
            </Stat>
            <Stat>
                <label>Hours</label>
                <strong>{hours(totals.seconds)}</strong>
            </Stat>
            <Stat>
                <label>Cash</label>
                <strong>{yen(totals.cash)}</strong>
            </Stat>
            <Stat>
                <label>Card</label>
                <strong>{yen(totals.card)}</strong>
            </Stat>
            <Stat>
                <label>Other</label>
                <strong>{yen(totals.other)}</strong>
            </Stat>
            <Stat>
                <label>Cover</label>
                <strong>{yen(totals.cover)}</strong>
            </Stat>
        </Grid>
    );
}

function People({ hoursList }: { hoursList: ShiftReport["staff_hours"] }) {
    if (hoursList.length === 0) return <p>No clock-ins.</p>;
    return (
        <div>
            {hoursList.map((person) => (
                <Row key={person.user_id}>
                    <span>{person.name}</span>
                    <span>{hours(person.seconds)}</span>
                </Row>
            ))}
        </div>
    );
}

function PeopleHours({ shifts }: { shifts: ShiftReport[] }) {
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
    const rows = [...people.values()].sort((a, b) => b.seconds - a.seconds);
    if (rows.length === 0) return <p>No clock-ins.</p>;
    return (
        <div>
            {rows.map((person) => (
                <Row key={person.userId}>
                    <span>{person.name}</span>
                    <span>
                        {hours(person.seconds)} · {person.nights} nights
                    </span>
                </Row>
            ))}
        </div>
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

const Row = styled.p`
    display: flex;
    justify-content: space-between;
    gap: var(--space-1);
    margin: 0;
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
