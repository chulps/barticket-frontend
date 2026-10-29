import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import RequestState from "../components/RequestState";
import { accountApi, type PersonalEarningsPreview } from "../api/account";
import { ApiError } from "../api/client";
import { localeTag, type Locale } from "../i18n";

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

export default function StaffIncome({ userId, locale }: { userId: number; locale: Locale }) {
    const ja = locale === "ja";
    const [month, setMonth] = useState(thisMonth);
    const [category, setCategory] = useState<Category>("all");
    const [sort, setSort] = useState<SortOrder>("date");
    const [report, setReport] = useState<PersonalEarningsPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            setLoading(true);
            setError("");
            try {
                const response = await accountApi.personalEarnings(month);
                if (response.user_id !== userId) throw new Error("Profile identity mismatch");
                if (!cancelled) setReport(response);
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
    }, [userId, month, refreshKey, ja]);

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
        <Wrapper aria-label={ja ? "自分の収入内訳" : "My income breakdown"}>
            <Heading>
                <div>
                    <h2>{ja ? "収入内訳" : "Income breakdown"}</h2>
                    <p>{ja ? "確認できる賃金とスタッフドリンク手当を種類別に表示します。" : "View recorded wage and staff-drink estimates by category."}</p>
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
            </Toolbar>

            {loading ? <RequestState kind="loading" detail={ja ? "読み込み中…" : "Loading…"} />
                : error ? <ErrorArea role="alert">
                    <p>{error}</p>
                    <button type="button" className="small secondary" onClick={() => setRefreshKey(value => value + 1)}>
                        {ja ? "再試行" : "Retry"}
                    </button>
                </ErrorArea> : report ? (
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
                                <HistoryEntry key={`${entry.category}-${entry.business_date}-${index}`}>
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
