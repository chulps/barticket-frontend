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
import { buildChuckProfileStats, type ChuckProfileStats } from "./chuckProfileStats";
import { readRevenueShareViewers } from "./managerRevenueShareAccess";
import { shiftMonth } from "./analyticsNavigation";
import { chuckPayDisplay } from "./chuckPayDisplay";

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
    const [showStats, setShowStats] = useState(false);
    const [month, setMonth] = useState(thisMonth);
    const [category, setCategory] = useState<Category>("all");
    const [sort, setSort] = useState<SortOrder>("date");
    const [report, setReport] = useState<PersonalEarningsPreview | null>(null);
    const [chuckReport, setChuckReport] = useState<ChuckMonthlyPayPreview | null>(null);
    const [chuckStatsResult, setChuckStatsResult] = useState<{
        key: string;
        stats?: ChuckProfileStats;
        error?: string;
    } | null>(null);
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

    useEffect(() => {
        if (!isChuckProfile || !showStats) return;
        let cancelled = false;
        const key = `${userId}:${month}`;
        const [year, monthNumber] = month.split("-").map(Number);
        const lastDay = new Date(year, monthNumber, 0).getDate();
        const dateFrom = `${month}-01`;
        const dateTo = `${month}-${String(lastDay).padStart(2, "0")}`;
        Promise.all([accountApi.analyticsShifts(), accountApi.serviceSales(dateFrom, dateTo)])
            .then(([shifts, sales]) => {
                if (sales.basis !== "original_service_business_date") throw new Error("Unexpected sales basis");
                if (!cancelled) setChuckStatsResult({ key, stats: buildChuckProfileStats(shifts, sales, userId, month) });
            })
            .catch(err => {
                if (!cancelled) setChuckStatsResult({ key, error: err instanceof ApiError ? err.message : String(err) });
            });
        return () => { cancelled = true; };
    }, [isChuckProfile, month, refreshKey, userId, showStats]);

    const statsResult = isChuckProfile && chuckStatsResult?.key === `${userId}:${month}`
        ? chuckStatsResult : null;
    const chuckStats = statsResult?.stats ?? null;
    const chuckStatsLoading = isChuckProfile && statsResult === null;
    const chuckStatsError = statsResult?.error ?? "";
    const payDisplay = chuckReport ? chuckPayDisplay(chuckReport) : null;

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
    const chuckChartRows: PayChartRow[] = chuckReport?.complete && chuckReport.gross_salary_yen !== null &&
        chuckReport.staff_cost_total_yen !== null && chuckReport.net_amount_owed_yen !== null &&
        chuckReport.deduction_total_yen >= 0 && chuckReport.staff_cost_total_yen >= 0 && chuckReport.net_amount_owed_yen >= 0 &&
        Math.abs(chuckReport.gross_salary_yen - chuckReport.staff_cost_total_yen - chuckReport.deduction_total_yen - chuckReport.net_amount_owed_yen) < 1
        ? [{
            key: "chuck-monthly-pay",
            label: ja ? "月間内訳" : "Monthly breakdown",
            segments: [
                { key: "owed", label: ja ? "Chuckへの支払予定額" : "Owed to Chuck", value: chuckReport.net_amount_owed_yen, color: "var(--royal-400)" },
                { key: "staff-pay", label: ja ? "スタッフ給与" : "Staff pay", value: chuckReport.staff_cost_total_yen, color: "var(--success-400)" },
                { key: "deductions", label: ja ? "その他の控除" : "Other deductions", value: chuckReport.deduction_total_yen, color: "var(--warning-400)" },
            ],
            total: chuckReport.gross_salary_yen,
        }] : [];
    const staffDonutSlices: DonutSlice[] = staffChartRows[0]?.segments.map(segment => ({
        id: segment.key,
        label: segment.label,
        value: segment.value,
        display: money(segment.value, locale),
        color: segment.color,
    })) ?? [];
    const chuckDonutSlices: DonutSlice[] = chuckChartRows[0]?.segments.map(segment => ({
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
    const completeStaffOwed = chuckReport?.complete
        ? chuckReport.staff_owed.filter((person): person is typeof person & { total_owed_yen: number } => person.total_owed_yen !== null)
        : [];
    const chuckStaffBars: NamedBar[] = chuckReport?.complete && completeStaffOwed.length > 1 && completeStaffOwed.length === chuckReport.staff_owed.length
        ? completeStaffOwed.map(person => ({
            id: String(person.user_id),
            label: person.name,
            value: person.total_owed_yen,
            display: money(person.total_owed_yen, locale),
        }))
        : [];
    const knownChuckSales = (chuckStats?.nights ?? []).filter(
        (night): night is typeof night & { billedSalesYen: number } => night.billedSalesYen !== null);
    const chuckRevenueBars: NamedBar[] = knownChuckSales.map(night => ({
        id: String(night.shiftId),
        label: new Date(`${night.businessDate}T12:00:00`).toLocaleDateString(localeTag(locale), { month: "short", day: "numeric" }),
        value: night.billedSalesYen,
        display: money(night.billedSalesYen, locale),
    }));
    const chuckBilledSales = chuckStats && chuckStats.nights.every(night => night.billedSalesYen !== null)
        ? chuckStats.nights.reduce((sum, night) => sum + (night.billedSalesYen ?? 0), 0)
        : null;
    const chuckMissingSalesNights = chuckStats?.nights.filter(night => night.billedSalesYen === null).length ?? 0;
    const chuckGuests = chuckStats?.nights.reduce((sum, night) => sum + night.guests, 0) ?? null;

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
                            <Metric>
                                <span>{ja ? "Chuckへの支払予定額" : "Amount owed to Chuck"}</span>
                                <strong>{money(payDisplay?.netAmount ?? null, locale)}</strong>
                                {!chuckReport.complete ? <small>{ja ? "一部の記録が不足しているため確定できません" : "Unavailable until required records are complete"}</small> : null}
                            </Metric>
                        </Summary>
                        <p>{ja ? "これは給与見積もりであり、支払記録ではありません。" : "This is a pay estimate, not a payment record."}</p>
                        <Details><summary>{ja ? "見積もりについて" : "About this estimate"}</summary><Notice role="note">{ja
                            ? "これはChuck担当シフトに基づく月次の支払見積もりです。勤務時間・時給・対象スタッフドリンク・控除がすべて確認できるまで、支払予定額は表示されません。これは支払記録ではなく、不明な項目を0円とは扱いません。"
                            : chuckReport.note}</Notice></Details>
                        {!chuckReport.complete && chuckReport.blockers.length ? (
                            <PayWarning role="status" aria-label={ja ? "給与見積もりの確認事項" : "Pay estimate warnings"}>
                                <strong><span aria-hidden="true"><Icon name="Warning" /></span>{ja ? "確認が必要です" : "Needs review"}</strong>
                                <ul>{chuckReport.blockers.map(code => <li key={code}>{payBlockerLabel(code, ja)}</li>)}</ul>
                            </PayWarning>
                        ) : null}
                        <Details><summary>{ja ? "給与の内訳・明細" : "Pay breakdown and details"}</summary>
                        <Summary>
                            <Metric>
                                <span>{ja ? "Chuckの総給与" : "Gross salary"}</span>
                                <strong>{money(chuckReport.gross_salary_yen, locale)}</strong>
                            </Metric>
                            <Metric>
                                <span>{payDisplay?.staffSubtotalPartial
                                    ? (ja ? "記録済みスタッフ給与の小計（一部）" : "Recorded staff pay subtotal (partial)")
                                    : (ja ? "スタッフに支払う金額" : "Staff pay owed")}</span>
                                <strong>{money(chuckReport.staff_cost_total_yen, locale)}</strong>
                                {payDisplay?.staffSubtotalPartial ? <small>{ja
                                    ? "未確認の勤務時間などは含まれません。最終的な支払額ではありません。"
                                    : "Missing or unverified inputs are not included. This is not the final amount owed."}</small> : null}
                            </Metric>
                            <Metric>
                                <span>{ja ? "その他の控除" : "Other deductions"}</span>
                                <strong>{money(chuckReport.deduction_total_yen, locale)}</strong>
                            </Metric>
                        </Summary>
                        {chuckDonutSlices.length && (chuckChartRows[0]?.total ?? 0) > 0 ? <DonutChart title={ja ? "総給与の内訳" : "Gross salary breakdown"}
                            slices={chuckDonutSlices} center={money(chuckReport.gross_salary_yen, locale)} locale={locale}
                            note={ja ? "総給与は支払予定額、スタッフ給与、その他の控除に分かれます。" : "Gross salary is divided into amount owed to Chuck, staff pay, and other deductions."} /> : null}
                        <h3>{ja ? "Chuck担当シフトのスタッフ給与" : "Staff pay on Chuck-managed shifts"}</h3>
                        {chuckStaffBars.length > 1 ? <HorizontalBarChart
                            title={ja ? "スタッフ別の支払予定額" : "Staff pay owed by person"}
                            bars={chuckStaffBars} locale={locale} /> : null}
                        {chuckReport.staff_owed.length ? <HistoryList>
                            {chuckReport.staff_owed.map(item => (
                                <HistoryEntry key={item.user_id}>
                                    <div>
                                        <strong>{item.name}</strong>
                                        <Meta>{ja ? "賃金" : "Wages"} {money(item.wages_yen, locale)} · {ja ? "スタッフドリンク" : "Staff drinks"} {money(item.staff_drink_bonus_yen, locale)}</Meta>
                                    </div>
                                    <Value>{money(item.total_owed_yen, locale)}</Value>
                                </HistoryEntry>
                            ))}
                        </HistoryList> : <Muted>{ja ? "この月のChuck担当シフトにスタッフ給与はありません。" : "No staff pay is recorded for Chuck-managed shifts this month."}</Muted>}
                        <h3>{ja ? "その他の控除" : "Other deductions"}</h3>
                        {chuckReport.deductions.length ? <HistoryList>
                            {chuckReport.deductions.map(item => (
                                <HistoryEntry key={item.id}>
                                    <div>
                                        <strong>{item.business_date} · {item.payee_name}</strong>
                                        <Meta>{item.reason}{item.reversal_of_id ? (ja ? " · 取消" : " · reversal") : ""}</Meta>
                                    </div>
                                    <Value>{money(item.amount_yen, locale)}</Value>
                                </HistoryEntry>
                            ))}
                        </HistoryList> : <Muted>{ja ? "その他の控除は記録されていません。" : "No other deductions are recorded."}</Muted>}
                        </Details>
                    </>
                ) : report ? (
                    <>
                        <Summary>
                            <Metric>
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
                            </Metric>
                        </Summary>
                        <p>{ja ? "これは給与見積もりであり、支払記録ではありません。" : "This is a pay estimate, not a payment record."}</p>
                        <Details><summary>{ja ? "見積もりについて" : "About this estimate"}</summary><Notice role="note">{ja
                            ? "これは記録された時間と対象ドリンクからの見積もりです。実際の支払済み金額ではありません。不明な時間や時給は0として扱いません。"
                            : report.note}</Notice></Details>
                        <Details><summary>{ja ? "収入のグラフ" : "Income charts"}</summary>
                        {staffChartComplete && (staffChartRows[0]?.total ?? 0) > 0 ? <DonutChart title={ja ? "月間収入の内訳" : "Monthly income breakdown"}
                            slices={staffDonutSlices} center={money(staffChartRows[0]?.total ?? 0, locale)} locale={locale} /> : <ChartNote role="note">{ja
                                ? staffChartComplete ? "この月の収入はありません。" : "勤務時間、時給、またはドリンク手当が未確認のため、内訳グラフは表示できません。"
                                : staffChartComplete ? "No income is recorded for this month." : "The breakdown chart is unavailable until hours, rates, and staff-drink bonuses are verified."}</ChartNote>}
                        {staffIncomeByDate.length > 1 ? <HorizontalBarChart
                            title={ja ? "日別収入の見積もり" : "Estimated income by day"}
                            bars={staffIncomeByDate} locale={locale} /> : null}
                        </Details>
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
            {isChuckProfile ? <Details onToggle={event => setShowStats(event.currentTarget.open)}><summary>{ja ? "担当シフトの売上・来客数" : "Managed-shift sales and guests"}</summary><StatsPanel aria-label={ja ? "Chuck担当シフトの統計" : "Stats for Chuck-managed shifts"}>
                <div>
                    <h3>{ja ? "Chuck担当シフトの統計" : "Chuck-managed shift stats"}</h3>
                    <p>{ja ? "営業日ごとの記録済み売上と来客数です。" : "Recorded service sales and guests by business date."}</p>
                </div>
                {chuckStatsLoading ? <p role="status">{ja ? "統計を読み込み中…" : "Loading stats…"}</p>
                    : chuckStatsError ? <p role="alert">{chuckStatsError}</p>
                        : chuckStats ? <>
                            <Summary>
                                <Metric><span>{ja ? "担当した営業日" : "Managed nights"}</span><strong>{chuckStats.nights.length}</strong></Metric>
                                <Metric><span>{ja ? "記録済み売上" : "Recorded sales"}</span><strong>{money(chuckBilledSales, locale)}</strong></Metric>
                                <Metric><span>{ja ? "来客数" : "Guests"}</span><strong>{chuckGuests === null ? "—" : chuckGuests.toLocaleString(localeTag(locale))}</strong></Metric>
                            </Summary>
                            {chuckRevenueBars.length ? <HorizontalBarChart
                                title={ja ? "営業日別の売上" : "Recorded sales by night"}
                                bars={chuckRevenueBars} locale={locale} />
                                : <ChartNote role="note">{chuckStats.nights.length === 0
                                    ? (ja ? "この月にChuck担当で終了したシフトはありません。" : "No closed shifts assigned to Chuck were recorded this month.")
                                    : (ja ? "スタッフ別売上の記録がないため、グラフを表示できません。" : "Ticket-level sales are unavailable for the recorded Chuck-managed shifts.")}
                                </ChartNote>}
                            {chuckMissingSalesNights > 0 ? <ChartNote role="note">{ja
                                ? `売上記録がない営業日が ${chuckMissingSalesNights} 日あります。合計では不明な金額を0円として扱いません。`
                                : `Ticket details are missing for ${chuckMissingSalesNights} managed night(s); each date uses its recorded shift total.`}</ChartNote> : null}
                            {chuckStats.unassignedManagerDays || chuckStats.ambiguousManagerDays ? <ChartNote role="note">{ja
                                ? `担当未設定または担当が重複した営業日は個人の統計に含めていません（未設定 ${chuckStats.unassignedManagerDays} 日、要確認 ${chuckStats.ambiguousManagerDays} 日）。`
                                : `Days without one confirmed manager are excluded from your stats (${chuckStats.unassignedManagerDays} unassigned, ${chuckStats.ambiguousManagerDays} needing review).`}</ChartNote> : null}
                            <ChartNote>{ja
                                ? "チケット明細がある日は請求額を、ない日はシフトに記録された合計を表示します。未収分はサービス日に一度だけ含み、後日の回収は加算しません。"
                                : "Sales use the original service date: ticket totals when available; otherwise, the recorded shift total fills the gap. Deferred tickets count once on that date; later collections are not added again."}</ChartNote>
                        </> : null}
            </StatsPanel></Details> : null}

        </Wrapper>
    );
}

const Wrapper = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: 12px;
    background: var(--neutral-900);
`;
const Details = styled.details`
    summary { cursor: pointer; padding: var(--space-1) 0; font-weight: 500; }
    &[open] > :not(summary) { margin-top: var(--space-1); }
`;
const StatsPanel = styled.section`
    display:flex;
    flex-direction:column;
    gap:var(--space-1);
    padding:var(--space-2);
    border:1px solid var(--neutral-700);
    border-radius:12px;
    background:var(--neutral-900);
    h3{font-size:var(--font-size-h4);}
    p{color:var(--neutral-300);}
`;
const Heading = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-2);
    h2 { font-size: var(--font-size-h4); }
    p { color: var(--neutral-300); }
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
const Metric = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    padding: var(--space-2);
    border-radius: 10px;
    background: var(--neutral-800);
    span, small { color: var(--neutral-300); }
    strong { font-family: var(--font-family-data); }
`;
const Notice = styled.p`color: var(--neutral-300);`;
const PayWarning = styled.div`
    color: var(--warning-500);
    border: 1px solid var(--warning-500);
    border-radius: 8px;
    padding: var(--space-2);
    strong { display: flex; align-items: center; gap: var(--space-1); }
    strong span { display: inline-flex; flex-shrink: 0; }
    ul { margin: var(--space-1) 0 0; padding-left: 1.25rem; }
    li + li { margin-top: var(--space-0); }
`;
const ChartNote = styled.p`color: var(--neutral-300); font-size: var(--font-size-small);`;
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
const Meta = styled.p`color: var(--neutral-300); font-size: var(--font-size-small);`;
const Value = styled.strong`white-space: nowrap;`;
const Muted = styled.p`color: var(--neutral-300);`;
const ErrorArea = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
`;
