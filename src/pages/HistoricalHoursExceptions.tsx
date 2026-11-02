import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { getToken } from "../api/client";
import { historicalHoursApi, type HistoricalHoursExceptions as Exceptions, type StoredHistoricalHours } from "../api/historicalHours";

export function StoredHoursEvidence({ record, ja }: { record: StoredHistoricalHours; ja: boolean }) {
    const hours = new Intl.NumberFormat(ja ? "ja-JP" : "en", { maximumFractionDigits: 4 }).format(record.duration_seconds / 3600);
    return <Evidence>
        <div><dt>{ja ? "保存済みの氏名・日付" : "Stored identity / date"}</dt><dd><bdi>{record.staff_name}</bdi> · {record.business_date}</dd></div>
        <div><dt>{ja ? "保存済みの時間" : "Stored hours"}</dt><dd>{hours} h · {record.verification_state === "verified" ? (ja ? "確認済み" : "Verified") : (ja ? "未確認" : "Not verified")}</dd></div>
        <div><dt>{ja ? "出典" : "Source"}</dt><dd>{record.source_file} · {ja ? "行" : "row"} {record.source_row} · {record.source_column}</dd></div>
        <div><dt>{ja ? "根拠・不確実性" : "Evidence / uncertainty"}</dt><dd>{record.uncertainty || (ja ? "記録なし。打刻時刻は不明です。" : "Not recorded. Clock times are unknown.")}</dd></div>
    </Evidence>;
}

export default function HistoricalHoursExceptions({ ja }: { ja: boolean }) {
    const [page, setPage] = useState<Exceptions | null>(null);
    const [busy, setBusy] = useState(true);
    const [failed, setFailed] = useState(false);
    const [retired, setRetired] = useState(false);
    const epoch = useRef(0);
    const pending = useRef(false);
    const active = useRef(false);

    async function load(afterId = 0) {
        if (!active.current || pending.current) return;
        const version = epoch.current, token = getToken();
        pending.current = true;
        setBusy(true); setFailed(false);
        const current = () => active.current && epoch.current === version && getToken() === token;
        try {
            const result = await historicalHoursApi.exceptions(afterId);
            if (!current()) return;
            setPage(previous => ({ ...result, rows: afterId && previous
                ? [...previous.rows, ...result.rows.filter(row => !previous.rows.some(old => old.id === row.id))]
                : result.rows }));
        } catch {
            if (current()) setFailed(true);
        } finally {
            if (current()) { pending.current = false; setBusy(false); }
        }
    }

    useEffect(() => {
        active.current = true;
        const initialLoad = window.setTimeout(() => void load(), 0);
        const clear = () => {
            window.clearTimeout(initialLoad); active.current = false;
            epoch.current++; pending.current = false;
            setPage(null); setFailed(false); setBusy(false); setRetired(true);
        };
        window.addEventListener("barticket-auth", clear);
        return () => { window.clearTimeout(initialLoad); active.current = false; epoch.current++; pending.current = false; window.removeEventListener("barticket-auth", clear); };
    }, []);

    return <Section aria-labelledby="historical-exceptions-title">
        <h3 id="historical-exceptions-title">{ja ? "アカウント未紐付けの過去の勤務時間" : "Historical hours without an account"}</h3>
        <p>{ja ? "保存済みの記録を確認するための一覧です。個人別レポートには含まれません。時間の根拠を確認し、打刻や給与が確定したものとして扱わないでください。" : "Read-only stored records excluded from individual reports. Review their evidence; these are not confirmed clock times or pay."}</p>
        <p role="status">{busy ? (ja ? "記録を読み込み中…" : "Loading stored records…")
            : retired ? (ja ? "セッションが変更されました。この画面を開き直してください。" : "Session changed. Reopen this screen.")
                : page ? (page.rows.length ? (ja ? `表示中：${page.rows.length}件` : `Showing ${page.rows.length} records`) : (ja ? "未紐付けの保存済み記録はありません。" : "No stored unlinked records.")) : ""}</p>
        {failed && <p role="alert">{ja ? "記録を読み込めませんでした。接続とマネージャー権限を確認して再試行してください。" : "Could not load records. Check your connection and manager access, then retry."}</p>}
        <ul>{page?.rows.map(record => <li key={record.id}>
            <h4><bdi>{record.staff_name}</bdi> · {record.business_date}</h4>
            <p><strong>{ja ? "取り込み済み · アカウント未紐付け" : "Imported · Account unlinked"}</strong></p>
            <StoredHoursEvidence record={record} ja={ja} />
        </li>)}</ul>
        {failed && !retired ? <button type="button" disabled={busy} onClick={() => void load(page?.next_cursor ?? 0)}>{ja ? "再試行" : "Retry"}</button>
            : page?.next_cursor != null && !retired ? <button type="button" disabled={busy} onClick={() => void load(page.next_cursor!)}>{ja ? "続きを表示" : "Load more records"}</button> : null}
    </Section>;
}

const Section = styled.section`
    min-width: 0; padding: var(--space-2); background: var(--neutral-900); border-radius: 12px;
    line-height: 1.5; overflow-wrap: anywhere;
    h3 { margin: 0 0 var(--space-1); } > p { max-width: 70ch; }
    ul { list-style: none; padding: 0; margin: var(--space-2) 0; }
    li { padding-block: var(--space-2); border-top: 1px solid var(--neutral-700); }
    h4 { font-size: var(--font-size-default); margin: 0; }
    button { min-height: 44px; width: auto; background: var(--neutral-800); }
`;
const Evidence = styled.dl`
    margin: var(--space-1) 0 0; line-height: 1.5; min-width: 0;
    > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-1); padding-block: var(--space-0); }
    dt { color: var(--neutral-300); } dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
    @media (max-width: 400px) { > div { grid-template-columns: minmax(0, 1fr); gap: 0; margin-bottom: var(--space-1); } }
`;
