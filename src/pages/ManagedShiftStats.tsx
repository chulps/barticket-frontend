import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { accountApi, type ManagedSalesPeriod, type ManagedShiftStatsReport } from "../api/account";
import { getToken } from "../api/client";
import { HorizontalBarChart } from "../components/AnalyticsCharts";
import { bestWeekdays, businessDateLabel, signedBar, weekdayLabel } from "./managedShiftStatsDisplay";

export default function ManagedShiftStats({ userId, month, locale, active }: {
    userId: number; month: string; locale: "en" | "ja"; active: boolean;
}) {
    const ja = locale === "ja";
    const [period, setPeriod] = useState<ManagedSalesPeriod>("month");
    const [revision, setRevision] = useState(0);
    const [results, setResults] = useState<Record<string, ManagedShiftStatsReport>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    // Only this mounted profile's current month's three ranges; never persist personal data.
    const cache = useRef(new Map<string, Promise<ManagedShiftStatsReport>>());
    const token = getToken();
    const identity = `${userId}:${token}:${month}:${revision}`;
    const cacheIdentity = useRef("");
    useEffect(() => {
        if (!active) return;
        let cancelled = false;
        if (cacheIdentity.current !== identity) {
            cache.current.clear();
            cacheIdentity.current = identity;
        }
        async function load(range: ManagedSalesPeriod) {
            let pending = cache.current.get(range);
            if (!pending) {
                pending = accountApi.managedShiftStats(month, range).then(report => {
                    if (getToken() !== token || report.user_id !== userId || report.month !== month ||
                        report.period !== range || report.basis !== "original_service_business_date") {
                        throw new Error("Profile identity or sales period mismatch");
                    }
                    return report;
                });
                cache.current.set(range, pending);
            }
            try {
                const report = await pending;
                if (!cancelled) {
                    setErrors(previous => ({ ...previous, [identity + ":" + range]: "" }));
                    setResults(previous => ({ ...Object.fromEntries(Object.entries(previous).filter(([key]) => key.startsWith(identity + ":"))), [identity + ":" + range]: report }));
                }
            } catch {
                if (cache.current.get(range) === pending) cache.current.delete(range);
                if (!cancelled) setErrors(previous => ({ ...Object.fromEntries(Object.entries(previous).filter(([key]) => key.startsWith(identity + ":"))), [identity + ":" + range]: ja ? "統計を読み込めませんでした。再読み込みしてください。" : "Could not load stats. Please refresh to retry." }));
            }
        }
        void load("month");
        if (period !== "month") void load(period);
        return () => { cancelled = true; };
    }, [active, identity, ja, month, period, token, userId]);

    const error = errors[identity + ":" + period] || errors[identity + ":month"] || "";
    const monthly = results[identity + ":month"];
    const selected = results[identity + ":" + period];
    const money = (value: number) => new Intl.NumberFormat(ja ? "ja-JP" : "en-US", {
        style: "currency", currency: "JPY", maximumFractionDigits: 2,
    }).format(value);
    const winners = bestWeekdays(selected?.weekdays ?? []);
    const values = selected?.weekdays.map(row => row.average_sales_yen ?? 0) ?? [];
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    return <Panel aria-label={ja ? "Chuck担当シフトの統計" : "Stats for Chuck-managed shifts"}>
        <Header><h3>{ja ? "Chuck担当シフトの統計" : "Chuck-managed shift stats"}</h3>
            <button type="button" onClick={() => setRevision(value => value + 1)}>{ja ? "再読み込み" : "Refresh stats"}</button>
        </Header>
        {error ? <p role="alert">{error}</p> : null}
        {!monthly && !error ? <p role="status">{ja ? "統計を読み込み中…" : "Loading stats…"}</p> : null}
        {monthly ? <>
            <p>{ja ? "選択した月の終了済み担当シフト" : "Closed managed shifts in selected month"}: {monthly.summary_shift_count} · {ja ? "売上" : "Sales"} {money(monthly.summary_sales_yen)} · {ja ? "来客数" : "Guests"} {monthly.summary_guests}</p>
            {monthly.nights.length ? <HorizontalBarChart title={ja ? "営業日別の売上" : "Recorded sales by night"}
                bars={monthly.nights.map(night => ({ id: String(night.shift_id), label: businessDateLabel(night.business_date, locale), value: night.sales_yen, display: money(night.sales_yen) }))}
                locale={locale} /> : <p>{ja ? "対象となる終了済みシフトがありません。" : "No eligible closed managed shifts in this month."}</p>}
        </> : null}
        <Header>
            <h3>{ja ? "曜日別の平均売上" : "Average sales by weekday"}</h3>
            <label>{ja ? "集計期間" : "Period"} <select value={period} onChange={event => setPeriod(event.target.value as ManagedSalesPeriod)}>
                <option value="month">{ja ? "選択中の月" : "Selected month"}</option>
                <option value="year">{ja ? "選択中の年" : "Selected year"}</option>
                <option value="all_time">{ja ? "全期間" : "All time"}</option>
            </select></label>
        </Header>
        <p>{ja ? "自分が担当した終了済みシフト1回あたりの平均売上。暦日数では割りません。" : "Average sales per closed shift you managed—not per calendar day."}
            {period !== "all_time" ? ` (${period === "month" ? month : month.slice(0, 4)})` : ""}</p>
        {!selected && !error ? <p role="status">{ja ? "平均を読み込み中…" : "Loading averages…"}</p> : null}
        {selected ? <>
            <p>{winners.length ? `${ja ? (winners.length > 1 ? "最高平均（同率）" : "最高平均") : (winners.length > 1 ? "Tied highest average" : "Highest average")}: ${winners.map(day => weekdayLabel(day, locale)).join(ja ? "・" : ", ")}`
                : (ja ? "比較できるシフトがありません。" : "No eligible shifts to compare.")}</p>
            <Bars aria-label={ja ? "曜日別の平均売上とシフト数" : "Weekday averages and shift counts"}>
                {selected.weekdays.map(row => {
                    const geometry = signedBar(row.average_sales_yen ?? 0, min, max);
                    return <li key={row.weekday}>
                        <BarLabel><strong>{weekdayLabel(row.weekday, locale)}{winners.includes(row.weekday) ? " ★" : ""}</strong>
                            <span>{row.average_sales_yen === null ? (ja ? "データなし" : "No data") : money(row.average_sales_yen)} · {row.shift_count} {ja ? "シフト" : row.shift_count === 1 ? "shift" : "shifts"}</span>
                        </BarLabel>
                        <Track aria-hidden="true"><i style={{ left: `${geometry.zero}%` }} /><b style={{
                            left: `${geometry.left}%`, width: `${geometry.width}%`,
                            background: winners.includes(row.weekday) ? "var(--success-400)" : "var(--royal-300)",
                        }} /></Track>
                    </li>;
                })}
            </Bars>
            <p>{ja ? "少ないシフト数の平均は変動しやすいため、各曜日の件数も確認してください。" : "Small samples can vary widely; compare the shift counts as well as the averages."}</p>
            <p>{ja
                ? `除外: 営業中 ${selected.excluded_open_shift_count}、記録未完了 ${selected.excluded_incomplete_shift_count}（うち営業日重複 ${selected.excluded_ambiguous_day_count}）。`
                : `Excluded: ${selected.excluded_open_shift_count} open shifts, ${selected.excluded_incomplete_shift_count} incomplete shifts (including ${selected.excluded_ambiguous_day_count} ambiguous business dates).`}</p>
        </> : null}
        <p>{ja ? "元の営業日の売上を使用します。チケット明細がない日は記録済みシフト合計を使用。取消チケットと後日の回収は加算しません。給与や利益の見積もりではありません。"
            : "Sales use the original business date, with recorded shift totals where ticket details are absent. Canceled tickets and later collections are not added. This is sales, not pay or profit."}</p>
    </Panel>;
}

const Panel = styled.section`
    display: grid; gap: var(--space-2); padding: var(--space-2);
    border: 1px solid var(--neutral-700); border-radius: 12px; min-width: 0;
    p { color: var(--neutral-300); }
`;
const Header = styled.div`
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-1);
    h3 { font-size: var(--font-size-h4); }
    select { max-width: 100%; }
`;
const Bars = styled.ul`
    list-style: none; padding: 0; margin: 0; display: grid; gap: var(--space-2);
    li { min-width: 0; }
`;
const BarLabel = styled.div`
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-1); margin-bottom: 4px;
    span { overflow-wrap: anywhere; font-family: var(--font-family-data); }
`;
const Track = styled.div`
    height: 16px; position: relative;
    i { position: absolute; top: -2px; bottom: -2px; width: 1px; background: var(--neutral-500); }
    b { position: absolute; top: 0; height: 16px; border-radius: 2px; }
`;
