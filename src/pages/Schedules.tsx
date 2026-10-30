import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import RequestState from "../components/RequestState";
import { scheduledShiftsApi, type ScheduledShift } from "../api/scheduledShifts";
import { businessDateJst } from "./shiftControlPolicy";
import { useI18n } from "../i18n";

function offsetDate(date: string, amount: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + amount * 86_400_000).toISOString().slice(0, 10);
}

export default function Schedules() {
    const { locale } = useI18n();
    const ja = locale === "ja";
    const [rows, setRows] = useState<ScheduledShift[]>([]);
    const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const load = useCallback(async () => {
        try {
            const today = businessDateJst(Date.now());
            // Keep a useful window of upcoming entries and past plans that never became actual shifts.
            const from = offsetDate(today, -180);
            const to = offsetDate(today, 180);
            const result = await scheduledShiftsApi.list(from, to);
            setError("");
            setDateRange({ from, to });
            setRows(result);
        } catch (err) {
            setRows([]);
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const initialLoad = window.setTimeout(() => { void load(); }, 0);
        const timer = window.setInterval(() => void load(), 60_000);
        window.addEventListener("focus", load);
        window.addEventListener("barticket-schedules-updated", load);
        return () => {
            window.clearTimeout(initialLoad);
            window.clearInterval(timer);
            window.removeEventListener("focus", load);
            window.removeEventListener("barticket-schedules-updated", load);
        };
    }, [load]);

    const stateLabel = (row: ScheduledShift) => row.schedule_state === "upcoming"
        ? (ja ? "予定" : "Scheduled")
        : row.schedule_state === "today" ? (ja ? "本日の予定" : "Scheduled today")
            : row.actual_shift_exists ? (ja ? "予定記録・実際のシフトあり" : "Schedule record · actual shift exists")
                : (ja ? "過去の予定・実際のシフト記録なし" : "Past plan · no actual shift recorded");

    return <Page>
        <header>
            <h1>{ja ? "シフト予定" : "Shift schedule"}</h1>
            <p>{ja
                ? "勤務表から確認した予定です。シフト、打刻、履歴勤務時間とは別に保存され、予定から勤務時間は作成されません。"
                : "Reviewed spreadsheet assignments. These are separate from shifts, clock punches, and historical hours; schedules never create worked time."}</p>
        </header>
        {dateRange ? <RangeText aria-live="polite">{ja
            ? `表示期間：${dateRange.from} ～ ${dateRange.to}`
            : `Showing schedule entries from ${dateRange.from} through ${dateRange.to}.`}</RangeText> : null}
        {loading ? <RequestState kind="loading" detail={ja ? "予定を読み込んでいます…" : "Loading schedules…"} /> : null}
        {error ? <ErrorBox role="alert">
            <span>{ja ? "シフト予定を読み込めませんでした。" : "Could not load the schedule."} ({error})</span>
            <button type="button" className="small secondary" onClick={() => void load()}>{ja ? "再試行" : "Retry"}</button>
        </ErrorBox> : null}
        {!loading && !error && rows.length === 0 ? <Section>
            <strong>{ja ? "この期間に予定はありません" : "No scheduled shifts in this period."}</strong>
            <p>{ja ? "表示期間を確認してください。" : "The date range above includes the past and upcoming six months."}</p>
        </Section> : null}
        {!loading && !error && rows.length ? <List aria-label={ja ? "シフト予定一覧" : "Scheduled shifts"}>
            {rows.map(row => <Entry key={row.id}>
                <EntryHeader>
                    <h2>{row.business_date}</h2>
                    <Badge $past={row.schedule_state === "past"}>{stateLabel(row)}</Badge>
                </EntryHeader>
                <dl>
                    <div><dt>{ja ? "マネージャー" : "Manager"}</dt><dd>{row.manager?.name ?? (ja ? "記載なし" : "Not listed")}</dd></div>
                    <div><dt>{ja ? "担当スタッフ" : "Assigned staff"}</dt><dd>{row.staff.length ? row.staff.map(person => person.name).join(", ") : (ja ? "記載なし" : "None listed")}</dd></div>
                    <div><dt>{ja ? "イベント" : "Event"}</dt><dd>{row.event_value ?? (ja ? "記載なし" : "Not listed")}</dd></div>
                    <div><dt>{ja ? "予定勤務時間" : "Scheduled hours"}</dt><dd>{ja ? "不明・取り込みなし" : "Unknown · not imported"}</dd></div>
                </dl>
                {row.provenance.map((source, index) => <Source key={`${source.source_file}:${source.source_row}:${index}`}>
                    <strong>{ja ? "勤務表の出典" : "Spreadsheet source"}</strong>
                    <span>{source.source_file} · {ja ? "行" : "row"} {source.source_row}</span>
                    <span>{ja ? "取り込み" : "Imported by"} {source.imported_by} · {new Date(source.imported_at).toLocaleString(ja ? "ja-JP" : "en-US")}</span>
                    {source.uncertainty ? <span>{ja ? "要確認" : "Uncertainty"}: {source.uncertainty}</span> : null}
                </Source>)}
                {row.actual_shift_exists ? <p className="shift-muted">{ja
                    ? "実際のシフト記録もあります。予定と実績は別の記録です。"
                    : "An actual shift is also recorded. The schedule and actual work record remain separate."}</p> : null}
            </Entry>)}
        </List> : null}
    </Page>;
}

const Page = styled.main`width: min(100% - 2rem, 980px); margin: 0 auto; padding: var(--space-2) 0 var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); h1 { font-size: var(--font-size-h3); } header p { color: var(--neutral-300); }`;
const Section = styled.section`padding: var(--space-2); background: var(--neutral-900); border-radius: 12px;`;
const RangeText = styled.p`color:var(--neutral-300);font-size:var(--font-size-small);font-family:var(--font-family-data);`;
const List = styled.div`display: grid; gap: var(--space-2);`;
const Entry = styled.article`padding: var(--space-2); background: var(--neutral-900); border: 1px solid var(--neutral-700); border-radius: 12px; display: flex; flex-direction: column; gap: var(--space-1); h2 { font-size: var(--font-size-default); margin: 0; } dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-1); margin: 0; } dt { color: var(--neutral-400); font-size: var(--font-size-small); } dd { margin: 0.2rem 0 0; overflow-wrap: anywhere; }`;
const EntryHeader = styled.div`display: flex; justify-content: space-between; align-items: center; gap: var(--space-1); flex-wrap: wrap;`;
const Badge = styled.span<{ $past: boolean }>`display: inline-block; padding: .2rem .65rem; border-radius: 999px; background: ${({ $past }) => $past ? "var(--neutral-800)" : "var(--success-900)"}; color: var(--neutral-100); font-size: var(--font-size-small);`;
const Source = styled.div`display: flex; flex-wrap: wrap; gap: .25rem var(--space-1); border-top: 1px solid var(--neutral-700); padding-top: var(--space-1); color: var(--neutral-300); font-size: var(--font-size-small); strong { color: var(--neutral-100); }`;
const ErrorBox = styled.div`display: flex; gap: var(--space-1); align-items: center; flex-wrap: wrap; padding: var(--space-2); border: 1px solid var(--danger-500); border-radius: 8px; button { width: auto; }`;
