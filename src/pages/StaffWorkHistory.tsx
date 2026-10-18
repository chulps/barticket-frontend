import { shouldPoll, subscribeRealtime } from "../api/realtime";
import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";

import { accountApi, type ShiftReport } from "../api/account";
import { ApiError } from "../api/client";
import { localeTag, type Locale } from "../i18n";
import { buildStaffActivity, recordedStaffTotals } from "./staffProfileData";

type Panel = "hours" | "drinks" | "benefits";

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

function hoursLabel(seconds: number) {
    return (seconds / 3600).toLocaleString(undefined, {
        minimumFractionDigits: 1, maximumFractionDigits: 1,
    }) + " h";
}

/**
 * Uses only existing authenticated Analytics and current-shift APIs.
 * It displays records explicitly linked to the signed-in user ID.
 * The backend's future private self-only endpoint is tracked separately.
 */
export default function StaffWorkHistory({ userId, locale }: { userId: number; locale: Locale }) {
    const ja = locale === "ja";
    const [closed, setClosed] = useState<ShiftReport[]>([]);
    const [current, setCurrent] = useState<ShiftReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const [section, setSection] = useState<Panel>("hours");
    const [month, setMonth] = useState("all");

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError("");
            try {
                const [closedShifts, currentShift] = await Promise.all([
                    accountApi.closedShifts(), accountApi.currentShift(),
                ]);
                if (cancelled) return;
                setClosed(closedShifts);
                setCurrent(currentShift);
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
        const unsubscribeRealtime = subscribeRealtime(["analytics", "shift"], load);
        const poll = window.setInterval(() => { if (shouldPoll()) void load(); }, 20000);
        return () => { cancelled = true; unsubscribeRealtime(); window.clearInterval(poll); };
    }, [userId, refreshKey, ja]);

    const rows = useMemo(() => buildStaffActivity(userId, closed, current), [userId, closed, current]);
    const months = useMemo(() =>
        [...new Set(rows.map(row => row.businessDate.slice(0, 7)))].sort().reverse(),
    [rows]);
    const filtered = useMemo(() =>
        rows.filter(row => month === "all" || row.businessDate.startsWith(month)),
    [rows, month]);
    const totals = useMemo(() => recordedStaffTotals(filtered), [filtered]);

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

            <Tabs role="tablist" aria-label={ja ? "勤務履歴の項目" : "Work history sections"}>
                {(["hours", "drinks", "benefits"] as const).map(key => (
                    <button key={key} type="button" role="tab"
                        aria-selected={section === key}
                        aria-controls="profile-work-panel"
                        className={section === key ? "secondary" : "hollow secondary"}
                        onClick={() => setSection(key)}>
                        {key === "hours" ? (ja ? "勤務時間" : "Hours")
                            : key === "drinks" ? (ja ? "スタッフドリンク" : "Staff drinks")
                                : (ja ? "手当・控除" : "Bonuses & adjustments")}
                    </button>
                ))}
            </Tabs>

            {section === "benefits" ? (
                <PanelBody id="profile-work-panel" role="tabpanel">
                    <h3>{ja ? "手当・調整・控除" : "Bonuses, adjustments & deductions"}</h3>
                    <p>{ja
                        ? "給与・手当・控除の個人記録は、専用のバックエンドAPIができるまで表示できません。金額が0円という意味ではありません。"
                        : "Your personal pay, bonuses and deductions will appear here when the private backend API is ready. Unavailable does not mean ¥0."}</p>
                    <Muted>{ja ? "現在は利用できません" : "Not available yet"}</Muted>
                </PanelBody>
            ) : (
                <PanelBody id="profile-work-panel" role="tabpanel">
                    <Toolbar>
                        <label>
                            {ja ? "対象月" : "Period"}
                            <select value={month} onChange={event => setMonth(event.target.value)}>
                                <option value="all">{ja ? "記録のある全期間" : "All recorded months"}</option>
                                {months.map(value => <option key={value} value={value}>{formatMonth(value, locale)}</option>)}
                            </select>
                        </label>
                    </Toolbar>
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
                                        <strong>{totals.recordedShifts || "—"}</strong>
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
                                {section === "hours" ? (
                                    <>
                                        <h3>{ja ? "勤務記録のあるシフト" : "Shifts with recorded activity"}</h3>
                                        {filtered.filter(row => row.hoursSeconds !== null).length ? (
                                            <HistoryList>
                                                {filtered.filter(row => row.hoursSeconds !== null).map(row =>
                                                    <HistoryEntry key={row.shiftId}>
                                                        <div>
                                                            <strong>{formatBusinessDate(row.businessDate, locale)}</strong>
                                                            <Meta>{row.status === "open" ? (ja ? "営業中" : "Open shift") : (ja ? "終了" : "Closed shift")}
                                                                {row.clockedIn ? " · " + (ja ? "勤務中" : "Clocked in") : ""}
                                                            </Meta>
                                                        </div>
                                                        <Value>{hoursLabel(row.hoursSeconds!)}</Value>
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
                                        ? "表示されるのは現在のAPIに登録された記録だけです。過去の勤務時間やスタッフドリンクは未登録の場合があります。「—」は未記録・不明を表し、0とは異なります。シフトをまたぐ夜は営業日で集計します。"
                                        : "Only activity currently stored in the API is included. Older hours or staff drinks may be missing. “—” means unavailable, not zero. Overnight shifts use the bar's business date."}
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
    button { min-width: 0; width: 100%; }
`;
const PanelBody = styled.div`
    display: flex; flex-direction: column; gap: var(--space-2);
    min-width: 0;
`;
const Toolbar = styled.div`
    display: flex; justify-content: flex-end;
    label { display: flex; flex-direction: column; gap: var(--space-0); width: min(100%, 260px); }
    select { background: var(--dark); width: 100%; }
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
