import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import RequestState from "../components/RequestState";
import { accountApi, type ChuckMonthlyPayPreview, type PersonalEarningsPreview } from "../api/account";
import { ApiError } from "../api/client";
import { localeTag, type Locale } from "../i18n";
import { canViewChuckPersonalPay } from "./chuckProfileAccess";
import { readRevenueShareViewers } from "./managerRevenueShareAccess";

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

export default function StaffIncome({ userId, locale, role }: { userId: number; locale: Locale; role: "staff" | "manager" }) {
    const ja = locale === "ja";
    const [month, setMonth] = useState(thisMonth);
    const [category, setCategory] = useState<Category>("all");
    const [sort, setSort] = useState<SortOrder>("date");
    const [report, setReport] = useState<PersonalEarningsPreview | null>(null);
    const [chuckReport, setChuckReport] = useState<ChuckMonthlyPayPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);
    const viewers = readRevenueShareViewers();
    const isChuckProfile = canViewChuckPersonalPay({ id: userId, role }, userId, viewers);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError("");
            try {
                if (isChuckProfile) {
                    const response = await accountApi.chuckMonthlyPay(month);
                    if (response.user_id !== userId) throw new Error("Profile identity mismatch");
                    if (!cancelled) {
                        setChuckReport(response);
                        setReport(null);
                    }
                } else {
                    const response = await accountApi.personalEarnings(month);
                    if (response.user_id !== userId) throw new Error("Profile identity mismatch");
                    if (!cancelled) {
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

    const wage = report?.categories.find((item): item is WageCategory => item.category === "hourly_wages");
    const bonus = report?.categories.find((item): item is DrinkCategory => item.category === "staff_drink_bonus");
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
                <label>
                    {ja ? "対象月" : "Month"}
                    <input type="month" value={month} onChange={event => setMonth(event.target.value)} />
                </label>
                {!isChuckProfile ? <>
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
                                <span>{ja ? "Chuckの総給与" : "Gross salary"}</span>
                                <strong>{money(chuckReport.gross_salary_yen, locale)}</strong>
                            </Metric>
                            <Metric>
                                <span>{ja ? "スタッフに支払う金額" : "Staff pay owed"}</span>
                                <strong>{money(chuckReport.staff_cost_total_yen, locale)}</strong>
                            </Metric>
                            <Metric>
                                <span>{ja ? "その他の控除" : "Other deductions"}</span>
                                <strong>{money(chuckReport.deduction_total_yen, locale)}</strong>
                            </Metric>
                            <Metric>
                                <span>{ja ? "Chuckへの支払予定額" : "Amount owed to Chuck"}</span>
                                <strong>{money(chuckReport.net_amount_owed_yen, locale)}</strong>
                                {!chuckReport.complete ? <small>{ja ? "一部の記録が不足しているため確定できません" : "Unavailable until required records are complete"}</small> : null}
                            </Metric>
                        </Summary>
                        <Notice role="note">{chuckReport.note}</Notice>
                        {!chuckReport.complete && chuckReport.blockers.length ? (
                            <ErrorArea role="status">
                                <ul>{chuckReport.blockers.map(code => <li key={code}>{payBlockerLabel(code, ja)}</li>)}</ul>
                            </ErrorArea>
                        ) : null}
                        <h3>{ja ? "Chuck担当シフトのスタッフ給与" : "Staff pay on Chuck-managed shifts"}</h3>
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
                    </>
                ) : report ? (
                    <>
                        <Summary>
                            <Metric>
                                <span>{ja ? "賃金の見積もり" : "Wage estimate"}</span>
                                <strong>{money(wage?.amount_yen_unrounded ?? null, locale)}</strong>
                                {wage && !wage.complete ? <small>{ja ? "一部の時間または時給が不明です" : "Some hours or rates are unavailable"}</small> : null}
                            </Metric>
                            <Metric>
                                <span>{ja ? "スタッフドリンク手当" : "Staff-drink bonus"}</span>
                                <strong>{money(bonus?.amount_yen ?? 0, locale)}</strong>
                            </Metric>
                        </Summary>
                        <Notice role="note">{ja
                            ? "これは記録された時間と対象ドリンクからの見積もりです。実際の支払済み金額ではありません。不明な時間や時給は0として扱いません。"
                            : report.note}</Notice>
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
    flex-wrap: wrap;
    gap: var(--space-2);
    label { display: flex; flex-direction: column; gap: var(--space-0); min-width: 180px; }
    input, select { box-sizing: border-box; }
`;
const Summary = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
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
