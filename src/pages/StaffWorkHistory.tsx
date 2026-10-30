import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";

import { accountApi, type PersonalWorkHistory } from "../api/account";
import { ApiError } from "../api/client";
import { localeTag, type Locale } from "../i18n";
import { HorizontalBarChart, type NamedBar } from "../components/AnalyticsCharts";
import AnalyticsDatePicker from "../components/AnalyticsDatePicker";
import Icon from "../components/Icon";
import TabGroup from "../components/TabGroup";
import { recordedStaffTotals, type StaffActivityRow } from "./staffProfileData";
import StaffIncome from "./StaffIncome";
import { shiftDay, shiftMonth, shiftYear } from "./analyticsNavigation";

type Panel = "hours" | "drinks" | "income";
type TimeScale = "all" | "year" | "month" | "day";

function formatBusinessDate(date: string, locale: Locale) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(localeTag(locale), {
        weekday: "short", month: "short", day: "numeric", year: "numeric",
    });
}

function formatMonth(month: string, locale: Locale) {
    const [year, number] = month.split("-").map(Number);
    return new Date(year, number - 1, 1).toLocaleDateString(localeTag(locale), {
        year: "numeric", month: "long",
    });
}

function hoursLabel(seconds: number | null) {
    if (seconds === null) return "—";
    return (seconds / 3600).toLocaleString(undefined, {
        minimumFractionDigits: 1, maximumFractionDigits: 1,
    }) + " h";
}

function currentDate() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function currentMonth() { return currentDate().slice(0, 7); }

/**
 * Loads the backend's self-only profile endpoint; no shared Analytics payload
 * is downloaded to build this private view.
 */
export default function StaffWorkHistory({ userId, locale, role }: { userId: number; locale: Locale; role: "staff" | "manager" }) {
    const ja = locale === "ja";
    const [history, setHistory] = useState<PersonalWorkHistory | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const [section, setSection] = useState<Panel>("hours");
    const [timeScale, setTimeScale] = useState<TimeScale>("all");
    const [month, setMonth] = useState(currentMonth);
    const [year, setYear] = useState(() => currentDate().slice(0, 4));
    const [day, setDay] = useState(currentDate);
    const tabRefs = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({});
    const availableSections: Panel[] = ["hours", "drinks", "income"];
    const activeSection: Panel = availableSections.includes(section) ? section : "hours";

    function moveTabFocus(current: Panel, key: string) {
        const currentIndex = availableSections.indexOf(current);
        const nextIndex = key === "Home" ? 0
            : key === "End" ? availableSections.length - 1
                : key === "ArrowRight" ? (currentIndex + 1) % availableSections.length
                    : (currentIndex - 1 + availableSections.length) % availableSections.length;
        const next = availableSections[nextIndex];
        setSection(next);
        tabRefs.current[next]?.focus();
    }

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError("");
            try {
                const response = await accountApi.workHistory();
                if (response.user_id !== userId) throw new Error("Profile identity mismatch");
                if (cancelled) return;
                setHistory(response);
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof ApiError ? err.message
                        : (ja ? "勤務履歴を読み込めませんでした。" : "Could not load work history."));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [userId, refreshKey, ja]);

    const rows = useMemo<StaffActivityRow[]>(() => (history?.shifts ?? []).map(shift => ({
        shiftId: shift.shift_id,
        businessDate: shift.business_date,
        status: shift.status,
        hoursSeconds: shift.hours_seconds,
        hoursState: shift.hours_state,
        clockedIn: shift.clocked_in,
        drinks: shift.drinks,
    })), [history]);
    const filtered = useMemo(() => rows.filter(row => {
        if (timeScale === "all") return true;
        if (timeScale === "year") return row.businessDate.startsWith(year);
        if (timeScale === "month") return row.businessDate.startsWith(month);
        return row.businessDate === day;
    }), [rows, timeScale, year, month, day]);
    const totals = useMemo(() => recordedStaffTotals(filtered), [filtered]);
    const hoursChartBars = useMemo<NamedBar[]>(() => {
        const known = filtered.filter(row => row.hoursSeconds !== null);
        if (timeScale === "all" || timeScale === "year") {
            const byMonth = new Map<string, number>();
            known.forEach(row => {
                const key = row.businessDate.slice(0, 7);
                byMonth.set(key, (byMonth.get(key) ?? 0) + (row.hoursSeconds ?? 0));
            });
            return [...byMonth.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, seconds]) => ({
                id: key,
                label: formatMonth(key, locale),
                value: seconds / 3600,
                display: hoursLabel(seconds),
                color: "var(--royal-400)",
            }));
        }
        return known.map(row => {
            const [year, monthNumber, day] = row.businessDate.split("-").map(Number);
            const label = new Date(year, monthNumber - 1, day).toLocaleDateString(localeTag(locale), {
                month: "short", day: "numeric",
            });
            return {
                id: String(row.shiftId),
                label,
                value: (row.hoursSeconds ?? 0) / 3600,
                display: hoursLabel(row.hoursSeconds),
                color: "var(--royal-400)",
            };
        });
    }, [filtered, timeScale, locale]);

    return (
        <Wrapper aria-label={ja ? "自分の勤務記録" : "My work records"}>
            <Heading>
                <div>
                    <h2>{ja ? "勤務履歴" : "My work history"}</h2>
                    <p>{ja ? "アカウントに紐づく記録のみ表示しています。" : "Only records linked to your account are shown."}</p>
                </div>
                <button type="button" className="small hollow secondary"
                    disabled={loading} onClick={() => setRefreshKey(value => value + 1)}>
                    {ja ? "更新" : "Refresh"}
                </button>
            </Heading>

            <Tabs role="tablist" aria-orientation="horizontal" aria-label={ja ? "勤務履歴の項目" : "Work history sections"}>
                {availableSections.map(key => (
                    <button key={key} ref={element => { tabRefs.current[key] = element; }} type="button" role="tab"
                        id={`profile-work-tab-${key}`}
                        aria-selected={activeSection === key}
                        aria-controls={`profile-work-panel-${key}`}
                        tabIndex={activeSection === key ? 0 : -1}
                        className={activeSection === key ? "secondary" : "hollow secondary"}
                        onClick={() => setSection(key)}
                        onKeyDown={event => {
                            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                            event.preventDefault();
                            moveTabFocus(key, event.key);
                        }}>
                        {key === "hours" ? (ja ? "勤務時間" : "Hours")
                            : key === "drinks" ? (ja ? "スタッフドリンク" : "Staff drinks")
                                : (ja ? "収入内訳" : "Income")}
                    </button>
                ))}
            </Tabs>

            {activeSection === "income" ? (
                <PanelBody id="profile-work-panel-income" role="tabpanel" aria-labelledby="profile-work-tab-income" tabIndex={0}>
                    <StaffIncome userId={userId} locale={locale} role={role} />
                </PanelBody>
            ) : (
                <PanelBody id={`profile-work-panel-${activeSection}`} role="tabpanel" aria-labelledby={`profile-work-tab-${activeSection}`} tabIndex={0}>
                    <TimeControls>
                        <TabGroup<TimeScale>
                            label={ja ? "表示期間" : "Time scale"}
                            tabs={[
                                { id: "all", label: ja ? "全期間" : "All Time" },
                                { id: "year", label: ja ? "年" : "Year" },
                                { id: "month", label: ja ? "月次" : "Monthly" },
                                { id: "day", label: ja ? "日次" : "Daily" },
                            ]}
                            activeTab={timeScale}
                            onChange={scale => {
                                setTimeScale(scale);
                                if (scale === "year") setYear(month.slice(0, 4));
                                if (scale === "month") setMonth(value => `${year}-${value.slice(5, 7)}`);
                                if (scale === "day") setDay(value => `${month}-${value.slice(8, 10)}`);
                            }}
                        />
                        {timeScale === "year" ? <PeriodNav>
                            <StepButton type="button" className="hollow secondary" aria-label={ja ? "前年" : "Previous year"}
                                onClick={() => { const next = shiftYear(year, -1); setYear(next); setMonth(value => `${next}-${value.slice(5, 7)}`); }}>
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <strong>{year}</strong>
                            <StepButton type="button" className="hollow secondary" aria-label={ja ? "翌年" : "Next year"}
                                onClick={() => { const next = shiftYear(year, 1); setYear(next); setMonth(value => `${next}-${value.slice(5, 7)}`); }}>
                                <Icon name="CaretRight" size="var(--font-size-h4)" />
                            </StepButton>
                        </PeriodNav> : null}
                        {timeScale === "month" ? <PeriodNav>
                            <StepButton type="button" className="hollow secondary" aria-label={ja ? "前月" : "Previous month"}
                                onClick={() => { const next = shiftMonth(month, -1); setMonth(next); setYear(next.slice(0, 4)); }}>
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <strong>{formatMonth(month, locale)}</strong>
                            <StepButton type="button" className="hollow secondary" aria-label={ja ? "翌月" : "Next month"}
                                onClick={() => { const next = shiftMonth(month, 1); setMonth(next); setYear(next.slice(0, 4)); }}>
                                <Icon name="CaretRight" size="var(--font-size-h4)" />
                            </StepButton>
                        </PeriodNav> : null}
                        {timeScale === "day" ? <PeriodNav>
                            <StepButton type="button" className="hollow secondary" aria-label={ja ? "前日" : "Previous day"}
                                onClick={() => { const next = shiftDay(day, -1); setDay(next); setMonth(next.slice(0, 7)); setYear(next.slice(0, 4)); }}>
                                <Icon name="CaretLeft" size="var(--font-size-h4)" />
                            </StepButton>
                            <AnalyticsDatePicker label={day} value={day} shiftDates={rows.map(row => row.businessDate)} onChange={value => {
                                setDay(value); setMonth(value.slice(0, 7)); setYear(value.slice(0, 4));
                            }} />
                            <StepButton type="button" className="hollow secondary" aria-label={ja ? "翌日" : "Next day"}
                                onClick={() => { const next = shiftDay(day, 1); setDay(next); setMonth(next.slice(0, 7)); setYear(next.slice(0, 4)); }}>
                                <Icon name="CaretRight" size="var(--font-size-h4)" />
                            </StepButton>
                        </PeriodNav> : null}
                    </TimeControls>
                    {loading ? <p role="status">{ja ? "勤務履歴を読み込み中…" : "Loading work history…"}</p>
                        : error ? (
                            <ErrorArea role="alert">
                                <p>{error}</p>
                                <button type="button" className="small secondary" onClick={() => setRefreshKey(value => value + 1)}>
                                    {ja ? "再試行" : "Retry"}
                                </button>
                            </ErrorArea>
                        ) : (
                            <>
                                <Summary>
                                    <Metric>
                                        <span>{ja ? "記録されたシフト" : "Recorded shifts"}</span>
                                        <strong>{totals.recordedShifts}</strong>
                                    </Metric>
                                    <Metric>
                                        <span>{ja ? "記録された勤務時間" : "Recorded hours"}</span>
                                        <strong>{totals.hoursSeconds === null ? "—" : hoursLabel(totals.hoursSeconds)}</strong>
                                    </Metric>
                                    <Metric>
                                        <span>{ja ? "記録されたスタッフドリンク" : "Recorded drinks"}</span>
                                        <strong>{totals.drinkCount === null ? "—" : totals.drinkCount}</strong>
                                    </Metric>
                                </Summary>
                                {activeSection === "hours" ? (
                                    <>
                                        {hoursChartBars.length ? <HorizontalBarChart
                                            title={timeScale === "all" || timeScale === "year"
                                                ? (ja ? "月別の勤務時間" : "Recorded hours by month")
                                                : (ja ? "シフト別の勤務時間" : "Recorded hours by shift")}
                                            bars={hoursChartBars} locale={locale} /> : null}
                                        <h3>{ja ? "勤務記録のあるシフト" : "Shifts with recorded activity"}</h3>
                                        {filtered.some(row => row.hoursSeconds !== null || row.hoursState === "incomplete") ? (
                                            <HistoryList>
                                                {filtered.filter(row => row.hoursSeconds !== null || row.hoursState === "incomplete").map(row =>
                                                    <HistoryEntry key={row.shiftId}>
                                                        <div>
                                                            <strong>{formatBusinessDate(row.businessDate, locale)}</strong>
                                                            <Meta>{row.status === "open" ? (ja ? "営業中" : "Open shift") : (ja ? "終了" : "Closed shift")}
                                                                {row.clockedIn ? " · " + (ja ? "勤務中" : "Clocked in") : ""}
                                                                {row.hoursState === "incomplete" ? " · " + (ja ? "打刻時間が不完全" : "Incomplete punch") : ""}
                                                            </Meta>
                                                        </div>
                                                        <Value>{hoursLabel(row.hoursSeconds)}</Value>
                                                    </HistoryEntry>
                                                )}
                                            </HistoryList>
                                        ) : <Muted>{ja ? "この期間には記録された勤務時間がありません。" : "No recorded hours for this period."}</Muted>}
                                    </>
                                ) : (
                                    <>
                                        <h3>{ja ? "受け取ったスタッフドリンク" : "Recorded staff drinks"}</h3>
                                        {filtered.some(row => row.drinks.length) ? (
                                            <HistoryList>
                                                {filtered.filter(row => row.drinks.length).map(row =>
                                                    <HistoryEntry key={row.shiftId}>
                                                        <div>
                                                            <strong>{formatBusinessDate(row.businessDate, locale)}</strong>
                                                            {row.drinks.map((drink, index) => (
                                                                <Meta key={index}>{drink.name} × {drink.quantity}</Meta>
                                                            ))}
                                                        </div>
                                                        <Value>{row.drinks.reduce((quantity, drink) => quantity + drink.quantity, 0)}</Value>
                                                    </HistoryEntry>
                                                )}
                                            </HistoryList>
                                        ) : <Muted>{ja ? "この期間には記録されたスタッフドリンクがありません。" : "No recorded staff drinks for this period."}</Muted>}
                                    </>
                                )}
                                <Coverage role="note">
                                    {ja
                                        ? "勤務時間は打刻記録のみで集計し、未取込の過去時間は含みません。グラフでは不明な勤務時間を除外します。スタッフIDが確認できるドリンクのみ表示し、受取人不明の記録は確認用に除外します。勤務中の時間は経過時間です。「—」は未記録・不明で、0とは異なります。営業日は正午に切り替わります。"
                                        : "Hours use clock punches only; historical totals have not been imported. The chart excludes unavailable hours. Drinks appear only when a staff ID is verified; unattributed records are excluded for review. Ongoing hours show elapsed time. “—” means unavailable, not zero. Business dates roll over at noon."}
                                </Coverage>
                            </>
                        )}
                </PanelBody>
            )}
        </Wrapper>
    );
}

const Wrapper = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;
    min-width: 0;
    h2 { font-size: var(--font-size-h4); font-weight: 500; }
    h3 { font-size: var(--font-size-h4); font-weight: 500; }
`;
const Heading = styled.div`
    display: flex; flex-wrap: wrap; justify-content: space-between; align-items: start;
    gap: var(--space-2);
    p { color: var(--neutral-300); }
    button { width: auto; }
`;
const Tabs = styled.div`
    display: grid; grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: var(--space-1);
    @media (min-width: 570px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    button { min-width: 0; width: 100%; min-height: 44px; }
    button:focus-visible { outline: 2px solid var(--royal-400); outline-offset: 2px; }
`;
const PanelBody = styled.div`
    display: flex; flex-direction: column; gap: var(--space-2);
    min-width: 0;
`;
const TimeControls = styled.div`
    display: flex; flex-direction: column; gap: var(--space-1);
    min-width: 0;
    > [role="group"] { width: 100%; }
`;
const PeriodNav = styled.div`
    display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center; gap: var(--space-1); min-height: 48px;
    strong { text-align: center; overflow-wrap: anywhere; }
`;
const StepButton = styled.button`
    width: 44px; min-height: 44px; padding: 0;
`;
const Summary = styled.div`
    display: grid; grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: var(--space-1);
    @media (min-width: 570px) { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;
const Metric = styled.div`
    padding: var(--space-2); background: var(--neutral-800); border-radius: 8px;
    display: flex; flex-direction: column; gap: var(--space-0);
    span { color: var(--neutral-300); }
    strong { font-size: var(--font-size-h3); font-weight: 500; }
`;
const HistoryList = styled.div`display: flex; flex-direction: column;`;
const HistoryEntry = styled.div`
    display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2);
    padding: var(--space-1) 0; border-bottom: 1px solid var(--neutral-700);
    min-width: 0;
    strong { display: block; font-weight: 500; }
`;
const Meta = styled.p`color: var(--neutral-300); overflow-wrap: anywhere;`;
const Value = styled.strong`white-space: nowrap;`;
const Coverage = styled.p`color: var(--neutral-300); font-size: var(--font-size-small); line-height: 1.5;`;
const Muted = styled.p`color: var(--neutral-300);`;
const ErrorArea = styled.div`
    color: var(--danger, #e06c75);
    button { width: auto; }
`;
