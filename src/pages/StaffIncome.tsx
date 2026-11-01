import { subscribeRealtime } from "../api/realtime";
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import RequestState from "../components/RequestState";
import NoriMonthlySummary from "./NoriMonthlySummary";
import { accountApi, type ChuckMonthlyPayPreview, type PersonalEarningsPreview } from "../api/account";
import { ApiError } from "../api/client";
import { localeTag, type Locale } from "../i18n";
import { DonutChart, HorizontalBarChart, type DonutSlice, type NamedBar } from "../components/AnalyticsCharts";
import Icon from "../components/Icon";
import type { PayChartRow } from "../components/PayBreakdownChart";
import { canViewChuckPersonalPay } from "./chuckProfileAccess";
import ManagedShiftStats from "./ManagedShiftStats";
import { readRevenueShareViewers } from "./managerRevenueShareAccess";
import { shiftMonth } from "./analyticsNavigation";
import ChuckPayBreakdown, { ChuckPayMethodology } from "./ChuckPayBreakdown";
import { buildChuckPayBreakdown } from "./chuckPayBreakdown";

type Category = "all" | "hourly_wages" | "staff_drink_bonus";
type SortOrder = "date" | "category";
type WageCategory = Extract<PersonalEarningsPreview["categories"][number], { category: "hourly_wages" }>;
type DrinkCategory = Extract<PersonalEarningsPreview["categories"][number], { category: "staff_drink_bonus" }>;
type IncomeEntry = {
    category: Exclude<Category, "all">;
    business_date: string;
    amount: number | null;
    detail: string;
};

function thisMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(month: string, locale: Locale) {
    const [year, number] = month.split("-").map(Number);
    return new Date(year, number - 1, 1).toLocaleDateString(localeTag(locale), { month: "long", year: "numeric" });
}

function money(amount: number | string | null, locale: Locale) {
    if (amount === null) return "—";
    return new Intl.NumberFormat(localeTag(locale), {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 2,
    }).format(Number(amount));
}

function hours(seconds: number) {
    return (seconds / 3600).toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
    }) + " h";
}


function payBlockerLabel(code: string, ja: boolean) {
    const english: Record<string, string> = {
        no_recorded_shifts: "No shifts are recorded for this month.",
        working_manager_unassigned: "At least one shift has no assigned manager.",
        working_manager_shift_open: "A Chuck-managed shift is still open.",
        staff_hours_unverified: "Staff hours are incomplete for at least one Chuck-managed shift.",
        staff_hourly_rate_missing: "A staff hourly rate is missing.",
        staff_drink_data_incomplete: "Staff-drink records are known to be incomplete. Recorded bonuses are partial; the final remaining amount is unavailable.",
        unattributed_staff_drink: "A paid staff drink has no linked staff member.",
        unassigned_staff_history: "Verified historical hours include a staff member not linked to an account.",
        staff_payroll_costs_incomplete: "Staff pay is incomplete, so the net amount owed cannot be calculated.",
        negative_balance_policy_unconfirmed: "The calculated balance is below zero and needs review.",
    };
    const japanese: Record<string, string> = {
        no_recorded_shifts: "この月のシフト記録がありません。",
        working_manager_unassigned: "担当マネージャーが未設定のシフトがあります。",
        working_manager_shift_open: "Chuck担当のシフトがまだ営業中です。",
        staff_hours_unverified: "Chuck担当のシフトのスタッフ勤務時間が未確認です。",
        staff_hourly_rate_missing: "スタッフの時給が未設定です。",
        staff_drink_data_incomplete: "スタッフドリンク記録が不足しています。記録済み手当は一部のみのため、差引後の最終額は確定できません。",
        unattributed_staff_drink: "スタッフが紐づいていない支払済みドリンクがあります。",
        unassigned_staff_history: "アカウントに紐づいていないスタッフの履歴があります。",
        staff_payroll_costs_incomplete: "スタッフ給与が不完全なため、差引後の金額を計算できません。",
        negative_balance_policy_unconfirmed: "計算結果がマイナスのため、確認が必要です。",
    };
    return (ja ? japanese : english)[code] ?? code;
}

type IncomeProps = { userId: number; locale: Locale; role: "staff" | "manager" };
export default function StaffIncome(props: IncomeProps) {
    const viewers = readRevenueShareViewers();
    const isNoriProfile = props.role === "manager" && viewers.noriUserId !== null &&
        props.userId === viewers.noriUserId && viewers.chuckUserId !== viewers.noriUserId;
    return isNoriProfile ? <NoriMonthlySummary userId={props.userId} locale={props.locale} />
        : <PersonalIncome {...props} />;
}

function PersonalIncome({ userId, locale, role }: IncomeProps) {
    const ja = locale === "ja";
    const [month, setMonth] = useState(thisMonth);
    const [category, setCategory] = useState<Category>("all");
    const [sort, setSort] = useState<SortOrder>("date");
    const [report, setReport] = useState<PersonalEarningsPreview | null>(null);
    const [chuckReport, setChuckReport] = useState<ChuckMonthlyPayPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    useEffect(() => subscribeRealtime(["shift", "tickets", "analytics"], () => setRefreshKey(value => value + 1)), []);
    const viewers = readRevenueShareViewers();
    const isChuckProfile = canViewChuckPersonalPay({ id: userId, role }, userId, viewers);

    const loadedIdentity = useRef("");
    useEffect(() => {
        let cancelled = false;
        const identity = `${userId}:${role}:${month}:${ja}`;
        async function load() {
            setLoading(loadedIdentity.current !== identity);
            if (loadedIdentity.current !== identity) setError("");
            try {
                if (isChuckProfile) {
                    const response = await accountApi.chuckMonthlyPay(month);
                    if (response.user_id !== userId) throw new Error("Profile identity mismatch");
                    if (!cancelled) {
                        loadedIdentity.current = identity;
                        setError("");
                        setChuckReport(response);
                        setReport(null);
                    }
                } else {
                    const response = await accountApi.personalEarnings(month);
                    if (response.user_id !== userId) throw new Error("Profile identity mismatch");
                    if (!cancelled) {
                        loadedIdentity.current = identity;
                        setError("");
                        setReport(response);
                        setChuckReport(null);
                    }
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof ApiError
                    ? err.message
                    : (ja ? "収入内訳を読み込めませんでした。" : "Could not load income breakdown."));
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        void load();
        return () => { cancelled = true; };
    }, [role, userId, month, refreshKey, ja, isChuckProfile]);


    const chuckBreakdown = chuckReport ? buildChuckPayBreakdown(chuckReport) : null;
    const recordedRemaining = chuckReport ? buildChuckPayBreakdown(chuckReport).recordedRemaining : null;

    const wage = report?.categories.find((item): item is WageCategory => item.category === "hourly_wages");
    const bonus = report?.categories.find((item): item is DrinkCategory => item.category === "staff_drink_bonus");
    const staffChartComplete = Boolean(wage && wage.complete && wage.amount_yen_unrounded !== null && bonus?.complete);
    const staffChartRows: PayChartRow[] = staffChartComplete ? [{
        key: "monthly-income",
        label: ja ? "月間見積もり" : "Monthly estimate",
        segments: [
            ...(wage?.amount_yen_unrounded !== null && wage?.amount_yen_unrounded !== undefined ? [{
                key: "wages", label: ja ? "賃金" : "Wages", value: Number(wage.amount_yen_unrounded), color: "var(--royal-400)",
            }] : []),
            ...(bonus ? [{
                key: "staff-drinks", label: ja ? "スタッフドリンク手当" : "Staff-drink bonus", value: bonus.amount_yen, color: "var(--success-400)",
            }] : []),
        ],
        total: (wage?.amount_yen_unrounded == null ? 0 : Number(wage.amount_yen_unrounded)) + (bonus?.amount_yen ?? 0),
    }] : [];
    const staffDonutSlices: DonutSlice[] = staffChartRows[0]?.segments.map(segment => ({
        id: segment.key,
        label: segment.label,
        value: segment.value,
        display: money(segment.value, locale),
        color: segment.color,
    })) ?? [];
    const entries = useMemo<IncomeEntry[]>(() => {
        const rows: IncomeEntry[] = [];
        for (const item of report?.categories ?? []) {
            if (item.category === "hourly_wages") {
                rows.push(...item.entries.map(entry => ({
                    category: item.category,
                    business_date: entry.business_date,
                    amount: entry.amount_yen_unrounded === null ? null : Number(entry.amount_yen_unrounded),
                    detail: entry.hourly_rate_yen === null
                        ? (ja ? "時給が未設定" : "Hourly rate unavailable")
                        : `${hours(entry.hours_seconds)} × ¥${entry.hourly_rate_yen.toLocaleString()} · ${entry.hours_basis}`,
                })));
            } else {
                rows.push(...item.entries.map(entry => ({
                    category: item.category,
                    business_date: entry.business_date,
                    amount: entry.amount_yen,
                    detail: ja
                        ? `${entry.eligible_units}杯 · 対象売上 ¥${entry.eligible_listed_revenue_yen.toLocaleString()} · ${entry.rate_percent}%`
                        : `${entry.eligible_units} units · eligible listed revenue ¥${entry.eligible_listed_revenue_yen.toLocaleString()} · ${entry.rate_percent}%`,
                })));
            }
        }
        return rows;
    }, [report, ja]);

    const filtered = useMemo(() => {
        const rows = entries.filter(entry => category === "all" || entry.category === category);
        return rows.sort((left, right) => sort === "date"
            ? right.business_date.localeCompare(left.business_date) || left.category.localeCompare(right.category)
            : left.category.localeCompare(right.category) || right.business_date.localeCompare(left.business_date));
    }, [entries, category, sort]);

    const staffIncomeByDate: NamedBar[] = staffChartComplete && entries.length > 1 && entries.every(entry => entry.amount !== null)
        ? [...entries.reduce<Map<string, number>>((byDate, entry) => {
            byDate.set(entry.business_date, (byDate.get(entry.business_date) ?? 0) + (entry.amount ?? 0));
            return byDate;
        }, new Map<string, number>())]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([date, amount]) => ({
                id: date,
                label: new Date(`${date}T12:00:00`).toLocaleDateString(localeTag(locale), { month: "short", day: "numeric" }),
                value: amount,
                display: money(amount, locale),
            }))
        : [];

    return (
        <Wrapper aria-label={isChuckProfile
            ? (ja ? "Chuckの月次給与" : "Chuck's monthly pay")
            : (ja ? "自分の収入内訳" : "My income breakdown")}>
            <Heading>
                <div>
                    <h2>{isChuckProfile
                        ? (ja ? "月次給与" : "Monthly pay")
                        : (ja ? "収入内訳" : "Income breakdown")}</h2>
                    <p>{isChuckProfile
                        ? (ja ? "Chuck担当のシフトに基づく金額です。" : "Amounts are based on Chuck-managed shifts.")
                        : (ja ? "自分に紐づく賃金とスタッフドリンク手当を表示します。" : "View wages and staff-drink bonuses linked to your account.")}</p>
                </div>
                <button type="button" className="small hollow secondary" disabled={loading}
                    onClick={() => setRefreshKey(value => value + 1)}>
                    {ja ? "更新" : "Refresh"}
                </button>
            </Heading>

            <Toolbar>
                <MonthNav aria-label={ja ? "月を選択" : "Choose month"}>
                    <PeriodButton type="button" className="hollow secondary" aria-label={ja ? "前月" : "Previous month"}
                        onClick={() => setMonth(value => shiftMonth(value, -1))}>
                        <Icon name="CaretLeft" size="var(--font-size-h4)" />
                    </PeriodButton>
                    <strong aria-live="polite">{monthTitle(month, locale)}</strong>
                    <PeriodButton type="button" className="hollow secondary" aria-label={ja ? "翌月" : "Next month"}
                        onClick={() => setMonth(value => shiftMonth(value, 1))}>
                        <Icon name="CaretRight" size="var(--font-size-h4)" />
                    </PeriodButton>
                </MonthNav>
                {!isChuckProfile ? <>
                    <Filters>
                        <summary>{ja ? "種類・並び順" : "Filter & sort"}</summary>
                        <label>
                            {ja ? "種類" : "Category"}
                            <select value={category} onChange={event => setCategory(event.target.value as Category)}>
                                <option value="all">{ja ? "すべて" : "All categories"}</option>
                                <option value="hourly_wages">{ja ? "賃金" : "Wages"}</option>
                                <option value="staff_drink_bonus">{ja ? "スタッフドリンク" : "Staff drinks"}</option>
                            </select>
                        </label>
                        <label>
                            {ja ? "並び順" : "Sort by"}
                            <select value={sort} onChange={event => setSort(event.target.value as SortOrder)}>
                                <option value="date">{ja ? "日付（新しい順）" : "Date (newest)"}</option>
                                <option value="category">{ja ? "種類、日付" : "Category, date"}</option>
                            </select>
                        </label>
                    </Filters>
                </> : null}
            </Toolbar>

            {loading ? <RequestState kind="loading" detail={ja ? "読み込み中…" : "Loading…"} />
                : error ? <ErrorArea role="alert">
                    <p>{error}</p>
                    <button type="button" className="small secondary" onClick={() => setRefreshKey(value => value + 1)}>
                        {ja ? "再試行" : "Retry"}
                    </button>
                </ErrorArea> : isChuckProfile && chuckReport ? (
                    <>
                        <Summary>
                            <Metric $primary>
                                <span>{ja ? "Chuckの差引後見積もり（記録済みデータ）" : "Chuck’s remaining estimate (recorded data)"}</span>
                                <strong>{money(recordedRemaining, locale)}</strong>
                                <StatusLabel>{ja ? "暫定" : "Provisional"}</StatusLabel>
                                <small>{ja ? "記録済みデータのみ。最終支払額・支払記録ではありません。" : "Provisional after recorded costs—not final pay or a payment record."}</small>
                                {recordedRemaining == null ? <small>{ja ? "記録済み金額の整合性を確認できるまで表示できません" : "Unavailable until recorded amounts can be reconciled"}</small> : null}
                            </Metric>
                        </Summary>
                        <ReviewNotes>
                        {chuckReport.staff_drink_data_status !== "complete" || chuckReport.blockers.includes("staff_drink_data_incomplete") ? <PayWarning role="status" aria-label={ja ? "ドリンク記録の確認状況" : "Drink-data coverage"}>
                            <strong><span aria-hidden="true"><Icon name="Warning" /></span>{chuckReport.staff_drink_data_status === "incomplete" || chuckReport.blockers.includes("staff_drink_data_incomplete")
                                ? (ja ? "ドリンク記録が不足しています" : "Drink records are incomplete")
                                : (ja ? "ドリンク記録の網羅性は未確認です" : "Drink-record coverage is unreviewed")}</strong>
                            <p>{ja ? "ドリンク手当は記録済み分のみです。不明な分を0円とは扱いません。" : "Recorded drink bonuses only; missing drinks are not assumed to be zero."}</p>
                        </PayWarning> : null}
                        {!chuckReport.complete && chuckReport.blockers.some(code => code !== "staff_drink_data_incomplete") ? (
                            <PayWarning role="status" aria-label={ja ? "給与見積もりの確認事項" : "Pay estimate warnings"}>
                                <strong><span aria-hidden="true"><Icon name="Warning" /></span>{ja ? "確認が必要です" : "Needs review"}</strong>
                                <ul>{chuckReport.blockers.filter(code => code !== "staff_drink_data_incomplete").map(code => <li key={code}>{payBlockerLabel(code, ja)}</li>)}</ul>
                            </PayWarning>
                        ) : null}
                        {chuckBreakdown?.inconsistent ? <PayWarning role="status">{ja ? "内訳と合計が一致しません。確認が必要です。" : "The breakdown and totals do not reconcile. Review is needed."}</PayWarning> : null}
                        </ReviewNotes>
                        <OpenSection><h3>{ja ? "給与の内訳・明細" : "Pay breakdown and details"}</h3>
                            <ChuckPayBreakdown report={chuckReport} locale={locale} />
                        </OpenSection>
                        <OpenSection><h3>{ja ? "見積もりについて" : "About this estimate"}</h3><Notice role="note">{ja
                            ? "これはChuck担当シフトの記録済みデータに基づく月次見積もりです。ドリンク記録の網羅性が未確認の場合、最終支払額ではありません。"
                            : chuckReport.note}</Notice><ChuckPayMethodology locale={locale} /></OpenSection>
                    </>
                ) : report ? (
                    <>
                        <Summary>
                            <Metric $primary>
                                <span>{ja ? "月間給与の見積もり" : "Monthly pay estimate"}</span>
                                <strong>{money(staffChartComplete ? staffChartRows[0]?.total ?? null : null, locale)}</strong>
                                {!staffChartComplete ? <small>{ja ? "勤務時間・時給・手当の確認が必要です" : "Hours, rates or bonuses need verification"}</small> : null}
                            </Metric>
                            <Metric>
                                <span>{ja ? "賃金の見積もり" : "Wage estimate"}</span>
                                <strong>{money(wage?.amount_yen_unrounded ?? null, locale)}</strong>
                                {wage && !wage.complete ? <small>{ja ? "一部の時間または時給が不明です" : "Some hours or rates are unavailable"}</small> : null}
                            </Metric>
                            <Metric>
                                <span>{ja ? "スタッフドリンク手当" : "Staff-drink bonus"}</span>
                                <strong>{money(bonus?.complete ? bonus.amount_yen : null, locale)}</strong>
                                {bonus && !bonus.complete ? <small>{ja ? "記録済み小計（一部）" : "Recorded subtotal (partial)"}: {money(bonus.amount_yen, locale)}</small> : null}
                            </Metric>
                        </Summary>
                        <p>{ja ? "これは給与見積もりであり、支払記録ではありません。" : "This is a pay estimate, not a payment record."}</p>
                        <OpenSection><h3>{ja ? "見積もりについて" : "About this estimate"}</h3><Notice role="note">{ja
                            ? "これは記録された時間と対象ドリンクからの見積もりです。実際の支払済み金額ではありません。不明な時間や時給は0として扱いません。"
                            : report.note}</Notice></OpenSection>
                        <OpenSection><h3>{ja ? "収入のグラフ" : "Income charts"}</h3>
                        {staffChartComplete && (staffChartRows[0]?.total ?? 0) > 0 ? <DonutChart title={ja ? "月間収入の内訳" : "Monthly income breakdown"}
                            slices={staffDonutSlices} center={money(staffChartRows[0]?.total ?? 0, locale)} locale={locale} /> : <ChartNote role="note">{ja
                                ? staffChartComplete ? "この月の収入はありません。" : "勤務時間、時給、またはドリンク手当が未確認のため、内訳グラフは表示できません。"
                                : staffChartComplete ? "No income is recorded for this month." : "The breakdown chart is unavailable until hours, rates, and staff-drink bonuses are verified."}</ChartNote>}
                        {staffIncomeByDate.length > 1 ? <HorizontalBarChart
                            title={ja ? "日別収入の見積もり" : "Estimated income by day"}
                            bars={staffIncomeByDate} locale={locale} /> : null}
                        </OpenSection>
                        <h3>{ja ? "明細" : "Entries"}</h3>
                        {filtered.length ? <HistoryList>
                            {filtered.map((entry, index) => (
                                <HistoryEntry key={entry.category + "-" + entry.business_date + "-" + index}>
                                    <div>
                                        <strong>{entry.business_date}</strong>
                                        <Meta>{entry.category === "hourly_wages"
                                            ? (ja ? "賃金" : "Wages")
                                            : (ja ? "スタッフドリンク手当" : "Staff-drink bonus")} · {entry.detail}</Meta>
                                    </div>
                                    <Value>{money(entry.amount, locale)}</Value>
                                </HistoryEntry>
                            ))}
                        </HistoryList> : <Muted>{ja ? "この月の収入記録はありません。" : "No income records for this month."}</Muted>}
                    </>
                ) : null}
            {isChuckProfile ? <OpenSection aria-label={ja ? "担当シフトの売上・来客数" : "Managed-shift sales and guests"}>
                <h3>{ja ? "担当シフトの売上・来客数" : "Managed-shift sales and guests"}</h3>
                <ManagedShiftStats userId={userId} month={month} locale={locale} active={true} />
            </OpenSection> : null}

        </Wrapper>
    );
}

const Wrapper = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    min-width: 0;
    background: var(--neutral-900);
    border-radius: 12px;
    > h3 { font-size: var(--font-size-h4); }
`;
const OpenSection = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    padding-top: var(--space-3);
    border-top: 1px solid var(--neutral-700);
    h3 { font-size: var(--font-size-h4); font-weight: 600; line-height: 1.35; }
`;
const Heading = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
    h2 { font-size: var(--font-size-h4); }
    button { flex-shrink: 0; min-height: 44px; }
    p { color: var(--neutral-200); }
`;
const Toolbar = styled.div`
    display: flex;
    flex-direction: column;
    flex-wrap: wrap;
    gap: var(--space-2);
    label { display: flex; flex-direction: column; gap: var(--space-0); min-width: 180px; }
    input, select { box-sizing: border-box; }
`;
const MonthNav = styled.div`
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    align-items: center;
    gap: var(--space-1);
    strong { text-align: center; }
`;
const PeriodButton = styled.button`
    width: 44px;
    min-height: 44px;
    padding: 0;
`;
const Filters = styled.details`
    padding: var(--space-1);
    border: 1px solid var(--neutral-700);
    border-radius: 8px;
    summary { cursor: pointer; min-height: 32px; }
    label { margin-top: var(--space-1); }
`;
const Summary = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(190px, 100%), 1fr));
    gap: var(--space-1);
`;
const Metric = styled.div<{ $primary?: boolean }>`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-2) 0;
    grid-column: ${({ $primary }) => $primary ? "1 / -1" : "auto"};
    span, small { color: var(--neutral-200); line-height: 1.5; }
    small { font-size: calc(var(--font-size-p) * .875); }
    strong { font-family: var(--font-family-data); font-variant-numeric: tabular-nums; font-size: ${({ $primary }) => $primary ? "calc(var(--font-size-p) * 2)" : "var(--font-size-h4)"}; line-height: 1.2; overflow-wrap: anywhere; }
    @media(min-width:768px) { strong { font-size: ${({ $primary }) => $primary ? "calc(var(--font-size-p) * 2.5)" : "var(--font-size-h4)"}; } }
`;
const StatusLabel = styled.em`font-style: normal; font-size: var(--font-size-small); color: var(--warning-500);`;
const Notice = styled.p`color: var(--neutral-200); line-height: 1.6;`;
const ReviewNotes = styled.div`
    display: grid;
    gap: var(--space-2);
    &:has(> *) { border-left: 2px solid var(--warning-500); padding-left: var(--space-2); }
`;
const PayWarning = styled.div`
    color: var(--warning-500);
    line-height: 1.5;
    strong { display: flex; align-items: flex-start; gap: var(--space-1); }
    strong span { display: inline-flex; flex-shrink: 0; }
    p { margin-top: var(--space-1); }
    ul { margin: var(--space-1) 0 0; padding-left: 1.25rem; }
    li + li { margin-top: var(--space-0); }
`;
const ChartNote = styled.p`color: var(--neutral-200); font-size: var(--font-size-small);`;
const HistoryList = styled.ul`
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
`;
const HistoryEntry = styled.li`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    border-bottom: 1px solid var(--neutral-700);
`;
const Meta = styled.p`color: var(--neutral-200); font-size: var(--font-size-small);`;
const Value = styled.strong`white-space: nowrap;`;
const Muted = styled.p`color: var(--neutral-200);`;
const ErrorArea = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
`;
