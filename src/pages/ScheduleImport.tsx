import { useMemo, useState } from "react";
import styled from "styled-components";
import type { Account } from "../api/account";
import { scheduledShiftsApi, type SchedulePreview, type ScheduleSourceRow } from "../api/scheduledShifts";
import { buildScheduleBatch, defaultScheduleMapping, type ScheduleCsvMapping } from "./scheduledShiftsCsv";
import { parseCsv, type CsvData } from "./reconciliationCsv";

type Props = { users: Account[]; locale: string };
const emptyMapping: ScheduleCsvMapping = { date: "", manager: "", staffNames: "", staffColumns: [], event: "", uncertainty: "" };

export default function ScheduleImport({ users, locale }: Props) {
    const ja = locale === "ja";
    const [fileName, setFileName] = useState("");
    const [csv, setCsv] = useState<CsvData | null>(null);
    const [mapping, setMapping] = useState<ScheduleCsvMapping>(emptyMapping);
    const [preview, setPreview] = useState<SchedulePreview | null>(null);
    const [batch, setBatch] = useState<{ sourceFile: string; rows: ScheduleSourceRow[] } | null>(null);
    const [selected, setSelected] = useState<number[]>([]);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);

    const eligible = useMemo(() => preview?.rows.filter(row => ["new", "match", "already_imported"].includes(row.status)) ?? [], [preview]);

    async function readFile(file?: File) {
        setError(""); setNotice(""); setPreview(null); setBatch(null); setSelected([]);
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { setCsv(null); setError(ja ? "CSVファイルは2 MB以下にしてください。" : "Choose a CSV file under 2 MB."); return; }
        try {
            const parsed = parseCsv(await file.text());
            const detected = defaultScheduleMapping(parsed.headers, users);
            setCsv(parsed); setFileName(file.name); setMapping(detected);
        } catch (err) {
            setCsv(null); setFileName(""); setMapping(emptyMapping);
            setError(err instanceof Error ? err.message : String(err));
        }
    }

    function updateMapping(key: keyof ScheduleCsvMapping, value: string | string[]) {
        setMapping(current => ({ ...current, [key]: value }));
        setPreview(null); setBatch(null); setSelected([]); setNotice("");
    }

    async function reconcile() {
        if (!csv || !fileName || busy) return;
        setBusy(true); setError(""); setNotice(""); setPreview(null); setSelected([]);
        try {
            const parsed = buildScheduleBatch(csv, mapping, users, fileName);
            setBatch(parsed);
            setPreview(await scheduledShiftsApi.reconcile(parsed.sourceFile, parsed.rows));
        } catch (err) {
            setBatch(null); setError(err instanceof Error ? err.message : String(err));
        } finally { setBusy(false); }
    }

    async function saveSelected() {
        if (!batch || !preview || !selected.length || busy) return;
        const confirmed = window.confirm(ja
            ? `予定 ${selected.length} 件を保存しますか？シフト、打刻、勤務時間、売上、給与は作成されません。`
            : `Save ${selected.length} schedule rows? This creates no shifts, punches, work hours, revenue, or payroll.`);
        if (!confirmed) return;
        setBusy(true); setError(""); setNotice("");
        try {
            const result = await scheduledShiftsApi.import(batch.sourceFile, batch.rows, selected);
            window.dispatchEvent(new Event("barticket-schedules-updated"));
            setSelected([]);
            setNotice(ja
                ? `予定を保存しました (${result.imported_count})。出典を追加した既存予定: ${result.matched_existing_count}。`
                : `Schedules saved (${result.imported_count}). Existing schedules with added source records: ${result.matched_existing_count}.`);
            setPreview(await scheduledShiftsApi.reconcile(batch.sourceFile, batch.rows));
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally { setBusy(false); }
    }

    return <Block>
        <h2>{ja ? "シフト予定の取り込み" : "Import spreadsheet schedules"}</h2>
        <p>{ja
            ? "日付、マネージャー、担当スタッフ、イベント、出典を確認してから取り込みます。勤務時間欄は送信されず、予定から打刻や実績は作成されません。"
            : "Review business dates, assigned people, Event labels, and source rows before importing. Hour cells are not submitted; schedules never create punches or actual work records."}</p>
        <label>{ja ? "月次勤務表CSV (UTF-8)" : "Monthly spreadsheet CSV (UTF-8)"}
            <input type="file" accept=".csv,text/csv" onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void readFile(file); }} />
        </label>
        {csv ? <>
            <p>{fileName} · {csv.rows.length} {ja ? "行" : "rows"}</p>
            <Fields>
                <label>{ja ? "営業日" : "Business date"}<select value={mapping.date} onChange={event => updateMapping("date", event.target.value)}>
                    <option value="">{ja ? "列を選択" : "Select column"}</option>{csv.headers.map(header => <option key={header} value={header}>{header}</option>)}
                </select></label>
                <label>{ja ? "マネージャー" : "Manager"}<select value={mapping.manager} onChange={event => updateMapping("manager", event.target.value)}>
                    <option value="">{ja ? "なし" : "None"}</option>{csv.headers.map(header => <option key={header} value={header}>{header}</option>)}
                </select></label>
                <label>{ja ? "スタッフ名の列（任意）" : "Assigned staff names column (optional)"}<select value={mapping.staffNames} onChange={event => updateMapping("staffNames", event.target.value)}>
                    <option value="">{ja ? "なし" : "None"}</option>{csv.headers.map(header => <option key={header} value={header}>{header}</option>)}
                </select><small>{ja ? "複数名はセミコロン、改行、または | で区切ります。" : "Separate multiple names with semicolons, new lines, or |."}</small></label>
                <label>{ja ? "イベント列（任意）" : "Event column (optional)"}<select value={mapping.event} onChange={event => updateMapping("event", event.target.value)}>
                    <option value="">{ja ? "なし" : "None"}</option>{csv.headers.map(header => <option key={header} value={header}>{header}</option>)}
                </select></label>
                <label>{ja ? "不確実・確認メモ列（任意）" : "Uncertainty or review note column (optional)"}<select value={mapping.uncertainty} onChange={event => updateMapping("uncertainty", event.target.value)}>
                    <option value="">{ja ? "なし" : "None"}</option>{csv.headers.map(header => <option key={header} value={header}>{header}</option>)}
                </select></label>
            </Fields>
            <fieldset>
                <legend>{ja ? "スタッフ別の割当列" : "Staff assignment columns"}</legend>
                <p>{ja ? "選んだ列は、セルに値がある日に列名の人が担当するとして予定に記録します。セルの数値は勤務時間として読み込みません。" : "For each selected column, a nonblank cell means the person named by the column is assigned. Cell values are never read as hours."}</p>
                <ColumnList>{csv.headers.map(header => <label key={header}>
                    <input type="checkbox" checked={mapping.staffColumns.includes(header)} onChange={event => {
                        const next = event.target.checked ? [...mapping.staffColumns, header] : mapping.staffColumns.filter(item => item !== header);
                        updateMapping("staffColumns", next);
                    }} />{header}
                </label>)}</ColumnList>
            </fieldset>
            <button type="button" disabled={busy || !mapping.date || (!mapping.manager && !mapping.staffNames && !mapping.staffColumns.length)} onClick={() => void reconcile()}>
                {busy ? (ja ? "照合中…" : "Reviewing…") : (ja ? "予定を照合してレビュー" : "Review schedule rows")}
            </button>
        </> : null}
        {error ? <ErrorText role="alert">{error}</ErrorText> : null}
        {notice ? <Notice role="status">{notice}</Notice> : null}
        {preview && batch ? <>
            <p>{ja ? "新規" : "New"}: {preview.counts.new} · {ja ? "一致" : "Match"}: {preview.counts.match} · {ja ? "取込済み" : "Imported"}: {preview.counts.already_imported} · {ja ? "要確認" : "Review"}: {preview.counts.unmapped + preview.counts.conflict}</p>
            <Actions>
                <button type="button" className="small secondary" disabled={!eligible.length || busy} onClick={() => setSelected(eligible.map(row => row.source_row))}>
                    {ja ? "安全な行をすべて選択" : "Select eligible rows"}
                </button>
                <button type="button" className="small hollow secondary" disabled={!selected.length || busy} onClick={() => setSelected([])}>
                    {ja ? "選択解除" : "Clear selection"}
                </button>
            </Actions>
            <TableWrap><table>
                <thead><tr>
                    <th>{ja ? "保存" : "Save"}</th><th>{ja ? "営業日" : "Date"}</th><th>{ja ? "予定状態" : "Schedule state"}</th>
                    <th>{ja ? "マネージャー" : "Manager"}</th><th>{ja ? "担当スタッフ" : "Assigned staff"}</th>
                    <th>{ja ? "イベント" : "Event"}</th><th>{ja ? "出典" : "Source"}</th>
                    <th>{ja ? "時間" : "Hours"}</th><th>{ja ? "照合" : "Review"}</th>
                </tr></thead>
                <tbody>{preview.rows.map(row => {
                    const canSave = eligible.some(item => item.source_row === row.source_row);
                    const unmatched = [row.manager, ...row.staff].filter((person): person is NonNullable<typeof person> => Boolean(person && person.user_id === null)).map(person => person.name);
                    const scheduleStateText = row.schedule_state === "upcoming" ? (ja ? "予定" : "Upcoming")
                        : row.schedule_state === "today" ? (ja ? "本日の予定" : "Today")
                            : (ja ? "過去の予定" : "Past");
                    const statusText = row.status === "new" ? (ja ? "新規" : "New")
                        : row.status === "match" ? (ja ? "既存予定と一致" : "Matches existing schedule")
                            : row.status === "already_imported" ? (ja ? "この出典は取込済み" : "Source already imported")
                                : row.status === "unmapped" ? (ja ? "アカウント割当を確認" : "Check account mapping")
                                    : (ja ? "競合" : "Conflict");
                    return <tr key={row.source_row}>
                        <td><input type="checkbox" aria-label={`${row.business_date} source row ${row.source_row}`} disabled={!canSave || busy}
                            checked={selected.includes(row.source_row)} onChange={event => setSelected(current => event.target.checked
                                ? [...current, row.source_row] : current.filter(value => value !== row.source_row))} /></td>
                        <td>{row.business_date}</td><td>{scheduleStateText}{row.actual_shift_exists ? (ja ? " · 実際のシフトあり" : " · actual shift exists") : ""}</td>
                        <td>{row.manager?.name ?? "—"}</td><td>{row.staff.map(person => person.name).join(", ") || "—"}</td>
                        <td>{row.event_value ?? "—"}</td><td>{fileName} · {row.source_row}</td>
                        <td>{ja ? "不明・未取込" : "Unknown · not imported"}</td>
                        <td>{statusText}{row.problems.length ? <ul>{row.problems.map(problem => <li key={problem}>{problem}</li>)}</ul> : null}
                            {unmatched.length ? <small>{ja ? "未照合の名前をそのまま保存" : "Unmatched names kept as entered"}: {unmatched.join(", ")}</small> : null}</td>
                    </tr>;
                })}</tbody>
            </table></TableWrap>
            <p>{ja ? "取込では予定と出典だけが保存されます。実際のシフト、打刻、履歴勤務時間、売上、給与は変更されません。" : "Import saves schedule assignments and source provenance only. Existing shifts, punches, historical hours, revenue, and payroll are untouched."}</p>
            <button type="button" disabled={busy || !selected.length} onClick={() => void saveSelected()}>
                {busy ? (ja ? "保存中…" : "Saving…") : (ja ? `選択した予定を保存 (${selected.length})` : `Save selected schedules (${selected.length})`)}
            </button>
        </> : null}
    </Block>;
}

const Block = styled.section`display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); background: var(--neutral-900); border-radius: 12px; min-width: 0; h2 { font-size: var(--font-size-h4); } label { display: flex; flex-direction: column; gap: var(--space-0); } input,select { width: 100%; box-sizing: border-box; } small { display: block; color: var(--neutral-300); } fieldset { border: 1px solid var(--neutral-700); border-radius: 8px; }`;
const Fields = styled.div`display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-1); @media (min-width: 700px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }`;
const ColumnList = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: var(--space-1); label { display: flex; flex-direction: row; align-items: center; gap: var(--space-0); } input { width: auto; }`;
const Actions = styled.div`display: flex; gap: var(--space-1); flex-wrap: wrap;`;
const TableWrap = styled.div`overflow-x: auto; width: 100%; table { border-collapse: collapse; min-width: 900px; width: 100%; } th,td { text-align: left; vertical-align: top; padding: var(--space-1); border-bottom: 1px solid var(--neutral-700); } small { min-width: 120px; } ul { margin: .25rem 0; padding-left: 1.25rem; }`;
const ErrorText = styled.p`padding: var(--space-1); border: 1px solid var(--danger-500); border-radius: 8px;`;
const Notice = styled.p`padding: var(--space-1); border: 1px solid var(--success-500); border-radius: 8px;`;
