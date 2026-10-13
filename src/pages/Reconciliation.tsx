import { useMemo, useState } from "react";
import styled from "styled-components";
import type { ShiftReport } from "../api/account";
import { importPreview, parseCsv, type CsvData } from "./reconciliationCsv";

type Field = "manager" | "revenue" | "guests" | "event";
type Draft = { manager: string; revenue: string; guests: string; event: string; notes: string; staffHours: Record<string, string> };
const fresh = (shift: ShiftReport): Draft => ({
    manager: shift.opened_by ?? "", revenue: String(shift.paid_total), guests: String(shift.guest_count),
    event: "", notes: "", staffHours: Object.fromEntries(shift.staff_hours.map(row => [row.name, String(row.seconds / 3600)]))
});
const validNumber = (value: string) => value.trim() !== "" && /^\d+$/.test(value.trim());
const labels = (ja: boolean) => ({
    date: ja ? "日付" : "Date", manager: ja ? "マネージャー" : "Manager",
    revenue: ja ? "売上 (円)" : "Revenue (JPY)", guests: ja ? "来客数" : "Guests",
    event: ja ? "イベント" : "Event", notes: ja ? "修正理由・メモ" : "Correction notes",
    hours: ja ? "勤務時間（合計）" : "Total hours worked"
});

export default function Reconciliation({ shifts, locale, error }: { shifts: ShiftReport[]; locale: string; error: string }) {
    const ja = locale === "ja", text = labels(ja);
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [csv, setCsv] = useState<CsvData | null>(null);
    const [csvError, setCsvError] = useState("");
    const [mapping, setMapping] = useState<Record<string, string>>({});
    const [extraHourKey, setExtraHourKey] = useState("");
    const [includeHours, setIncludeHours] = useState<string[]>([]);
    const selected = shifts.find(shift => shift.id === selectedId) ?? null;
    const filtered = useMemo(() => shifts.filter(shift => [shift.business_date, shift.opened_by].join(" ").toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.business_date.localeCompare(a.business_date)), [shifts, search]);
    const invalidDraft = Boolean(draft && (!draft.manager.trim() || !validNumber(draft.revenue) || !validNumber(draft.guests) ||
        Object.values(draft.staffHours).some(value => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 24))));
    const changed = Boolean(draft && selected && (draft.manager !== selected.opened_by || draft.revenue !== String(selected.paid_total) ||
        draft.guests !== String(selected.guest_count) || draft.event || draft.notes ||
        Object.entries(draft.staffHours).some(([name, value]) => value !== String((selected.staff_hours.find(row => row.name === name)?.seconds ?? 0) / 3600))));
    const preview = useMemo(() => csv ? importPreview(csv, mapping, shifts) : null, [csv, mapping, shifts]);
    const update = (field: Field | "notes", value: string) => setDraft(previous => previous ? { ...previous, [field]: value } : previous);
    const open = (shift: ShiftReport) => { setSelectedId(shift.id); setDraft(fresh(shift)); };
    const mapField = (key: string, header: string) => setMapping(previous => ({ ...previous, [key]: header }));
    const mapOption = (key: string, name: string) => <label key={key}>{name}
        <select value={mapping[key] ?? ""} onChange={event => mapField(key, event.target.value)}>
            <option value="">{ja ? "選択なし" : "Not mapped"}</option>
            {csv?.headers.map(header => <option key={header} value={header}>{header}</option>)}
        </select>
    </label>;

    async function readCsv(file?: File) {
        setCsv(null); setMapping({}); setIncludeHours([]); setCsvError("");
        if (!file) return;
        if (file.size > 2_000_000) { setCsvError(ja ? "2 MB以下のCSVを選択してください。" : "Choose a CSV under 2 MB."); return; }
        try {
            const parsed = parseCsv(await file.text());
            setCsv(parsed);
            const defaults: Record<string, string> = {};
            for (const key of ["date", "manager", "revenue", "guests", "event"]) {
                const found = parsed.headers.find(header => header.toLowerCase().replace(/[^a-z]/g, "") === key);
                if (found) defaults[key] = found;
            }
            setMapping(defaults);
        } catch (e) { setCsvError(e instanceof Error ? e.message : String(e)); }
    }

    function copyDraft() {
        if (!draft || !selected || invalidDraft) return;
        const summary = JSON.stringify({ source: "manual draft — NOT SAVED", shift_id: selected.id, business_date: selected.business_date,
            original: { manager: selected.opened_by, revenue: selected.paid_total, guests: selected.guest_count },
            proposed: draft }, null, 2);
        void navigator.clipboard?.writeText(summary);
    }

    return <Wrap>
        <h2>{ja ? "データ照合と編集" : "Data reconciliation & editing"}</h2>
        <Notice role="status"><strong>{ja ? "プレビュー・編集中（未保存）" : "Preview / draft mode — NOT SAVED"}</strong>
            <p>{ja ? "ここでの編集やCSVアップロードはデータベースを変更しません。保存・インポートにはAndrewによるAPI対応が必要です。" :
                "Edits and CSV uploads stay in your browser. Nothing changes in PostgreSQL. Saving or importing requires backend APIs from Andrew."}</p>
        </Notice>
        {error ? <p role="alert">{error}</p> : null}
        <Block>
            <h3>{ja ? "既存シフトを編集（下書き）" : "Edit recorded shifts (draft)"}</h3>
            <p>{ja ? "APIで取得できたシフトのみ表示します。未移行の月は表示されません。" : "Only shifts currently returned by the API appear here. Unmigrated months will not appear."}</p>
            <label>{ja ? "日付・マネージャーを検索" : "Search date or manager"}
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="2026-09 / Chuck / Nori" />
            </label>
            <TableWrap><table><thead><tr><th>{text.date}</th><th>{text.manager}</th><th>{text.revenue}</th><th>{text.guests}</th><th /></tr></thead>
                <tbody>{filtered.map(shift => <tr key={shift.id}><td>{shift.business_date}</td><td>{shift.opened_by || "—"}</td>
                    <td>¥{shift.paid_total.toLocaleString()}</td><td>{shift.guest_count}</td><td><button type="button" className="small secondary" onClick={() => open(shift)}>{ja ? "編集" : "Edit draft"}</button></td></tr>)}</tbody></table></TableWrap>
            {!filtered.length ? <p>{ja ? "一致するシフトがありません。" : "No matching shifts were returned."}</p> : null}
            {selected && draft ? <Editor>
                <h3>{selected.business_date} — {ja ? "修正案" : "Proposed changes"}</h3>
                <p>{ja ? "元の値: " : "Original: "}{selected.opened_by} · ¥{selected.paid_total.toLocaleString()} · {selected.guest_count} {ja ? "名" : "guests"}</p>
                <Fields>
                    {(["manager", "revenue", "guests", "event", "notes"] as const).map(key =>
                        <label key={key}>{text[key]}
                            <input value={draft[key]} onChange={e => update(key, e.target.value)} type={key === "revenue" || key === "guests" ? "number" : "text"} min={key === "revenue" || key === "guests" ? 0 : undefined} />
                        </label>)}
                </Fields>
                <h3>{text.hours}</h3>
                <p>{ja ? "時間は合計で記録します。出勤・退勤の時刻は作成しません。" : "Record total hours only. Do not fabricate clock-in/out timestamps."}</p>
                {Object.entries(draft.staffHours).map(([name, value]) => <label key={name}>{name} <input type="number" min="0" max="24" step="0.25" value={value}
                    onChange={e => setDraft(current => current ? { ...current, staffHours: { ...current.staffHours, [name]: e.target.value } } : current)} /></label>)}
                <label>{ja ? "スタッフ名を追加（下書きのみ）" : "Add staff name (draft only)"}<input value={extraHourKey} onChange={e => setExtraHourKey(e.target.value)} /></label>
                <button type="button" className="small secondary" onClick={() => { const name = extraHourKey.trim(); if (name && !Object.hasOwn(draft.staffHours, name)) setDraft({ ...draft, staffHours: { ...draft.staffHours, [name]: "" } }); setExtraHourKey(""); }}>{ja ? "追加" : "Add staff"}</button>
                {invalidDraft ? <p role="alert">{ja ? "担当者・売上・来客数・勤務時間を確認してください。" : "Check manager, revenue, guests and hours for invalid values."}</p> : null}
                <p>{changed ? (ja ? "変更あり（未保存）" : "Unsaved changes") : (ja ? "変更なし" : "No changes")}</p>
                <Actions><button type="button" className="secondary" disabled={!changed || invalidDraft} onClick={copyDraft}>{ja ? "修正案をコピー" : "Copy draft JSON"}</button>
                    <button type="button" disabled title={ja ? "バックエンド対応待ち" : "Awaiting backend API"}>{ja ? "保存（未対応）" : "Save — unavailable"}</button>
                    <button type="button" className="hollow secondary" onClick={() => setDraft(fresh(selected))}>{ja ? "リセット" : "Reset draft"}</button>
                    <button type="button" className="hollow secondary" onClick={() => { setSelectedId(null); setDraft(null); }}>{ja ? "閉じる" : "Close"}</button></Actions>
            </Editor> : null}
        </Block>
        <Block>
            <h3>{ja ? "CSV取り込みプレビュー" : "CSV import preview"}</h3>
            <p>{ja ? "ファイルはブラウザ内でのみ解析されます。アップロードだけでは保存されません。" : "CSV is parsed in your browser only. Uploading does not save anything."}</p>
            <label>CSV (.csv, UTF-8)<input type="file" accept=".csv,text/csv" onChange={e => void readCsv(e.target.files?.[0])} /></label>
            {csvError ? <p role="alert">{csvError}</p> : null}
            {csv ? <>
                <p>{csv.rows.length} {ja ? "行" : "rows"} · {csv.headers.length} {ja ? "列" : "columns"}</p>
                <Fields>{(["date", "manager", "revenue", "guests", "event"] as const).map(key => mapOption(key, text[key]))}</Fields>
                <h4>{text.hours}</h4>
                <p>{ja ? "オプション: スタッフ勤務時間の列を追加できます。" : "Optional: map spreadsheet staff-hours columns."}</p>
                <Actions><select value={extraHourKey} onChange={e => setExtraHourKey(e.target.value)}><option value="">{ja ? "スタッフを選択" : "Choose staff"}</option>
                    {["Chuck", "Nori", "Haruka", "Kanata"].filter(name => !includeHours.includes(name)).map(name => <option key={name}>{name}</option>)}</select>
                    <button type="button" className="secondary" disabled={!extraHourKey} onClick={() => { setIncludeHours([...includeHours, extraHourKey]); setExtraHourKey(""); }}>{ja ? "追加" : "Add mapping"}</button></Actions>
                <Fields>{includeHours.map(name => mapOption("hours:" + name, name + " hours"))}</Fields>
                {preview?.errors.length ? <Notice role="alert">{preview.errors.slice(0, 20).map(message => <p key={message}>{message}</p>)}{preview.errors.length > 20 ? <p>+ {preview.errors.length - 20}</p> : null}</Notice> : null}
                {preview && !preview.errors.length ? <>
                    <p>{ja ? "新規" : "New"}: {preview.preview.filter(row => row.state === "new").length} · {ja ? "差異あり" : "Conflicts"}: {preview.preview.filter(row => row.state === "conflict").length} · {ja ? "一致" : "Matches"}: {preview.preview.filter(row => row.state === "match").length}</p>
                    <TableWrap><table><thead><tr><th>{text.date}</th><th>{text.manager}</th><th>{text.revenue}</th><th>{text.guests}</th><th>{ja ? "比較結果" : "Comparison"}</th></tr></thead>
                        <tbody>{preview.preview.map(({ imported, existing, state, differences }) => <tr key={imported.line}>
                            <td>{imported.date}</td><td>{imported.manager}{existing && existing.opened_by !== imported.manager ? " ← " + existing.opened_by : ""}</td>
                            <td>¥{imported.revenue.toLocaleString()}</td><td>{imported.guests}</td>
                            <td>{state === "new" ? (ja ? "DBに記録なし" : "Not in API") : state === "match" ? (ja ? "一致" : "Match") : differences.join(", ")}</td>
                        </tr>)}</tbody></table></TableWrap>
                </> : null}
                <button type="button" disabled title={ja ? "バックエンド対応待ち" : "Awaiting validated backend import API"}>{ja ? "確認して取り込む（未対応）" : "Commit import — unavailable"}</button>
            </> : null}
        </Block>
    </Wrap>;
}

const Wrap = styled.div`display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; h2 { font-size: var(--font-size-h4); } h3 { font-size: var(--font-size-default); } label { display: flex; flex-direction: column; gap: var(--space-0); min-width: 0; } input,select { width: 100%; box-sizing: border-box; }`;
const Block = styled.section`display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); background: var(--neutral-900); border-radius: 12px; min-width: 0;`;
const Notice = styled.div`padding: var(--space-2); border: 1px solid var(--neutral-600); border-radius: 8px; p { margin-top: var(--space-1); }`;
const TableWrap = styled.div`overflow-x: auto; width: 100%; table { border-collapse: collapse; min-width: 650px; width: 100%; } th, td { text-align: left; padding: var(--space-1); border-bottom: 1px solid var(--neutral-700); } td button { width: auto; }`;
const Editor = styled.div`display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); border: 1px solid var(--neutral-600); border-radius: 8px;`;
const Fields = styled.div`display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-1); @media (min-width: 700px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }`;
const Actions = styled.div`display: flex; flex-wrap: wrap; gap: var(--space-1); align-items: center; button,select { width: auto; }`;
