import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ApiError, getToken } from "../api/client";
import { revenueSharePolicyApi, type RevenueSharePolicies, type RevenueSharePolicy } from "../api/revenueSharePolicy";

type Props = { beneficiaryId: number; policy?: RevenueSharePolicy; locale: string; onSaved: () => void };
export default function AdminRevenueSharePolicy({ beneficiaryId, policy, locale, onSaved }: Props) {
    const ja = locale === "ja", t = (en: string, jp: string) => ja ? jp : en;
    const [data, setData] = useState<RevenueSharePolicies | null>(null);
    const [reload, setReload] = useState(0);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState(false);
    const [month, setMonth] = useState("");
    const [reason, setReason] = useState("");
    const [source, setSource] = useState("");
    const [rows, setRows] = useState<{threshold: string; rate: string}[]>([]);
    const [busy, setBusy] = useState(false);
    const [needsReload, setNeedsReload] = useState(false);
    const [saved, setSaved] = useState(false);
    const generation = useRef(0), pending = useRef(false);
    useEffect(() => {
        const token = getToken(), request = ++generation.current;
        let cancelled = false;
        async function load() {
        setData(null); setError(""); setSaved(false); setEditing(false); setBusy(false); setNeedsReload(false); pending.current = false;
        await revenueSharePolicyApi.list().then(result => {
            if (!cancelled && request === generation.current && getToken() === token) {
                if (result.beneficiary_user_id !== beneficiaryId) throw new Error("Policy beneficiary does not match");
                setData(result);
            }
        }).catch(() => { if (!cancelled && request === generation.current && getToken() === token) setError("load"); });
        }
        void load();
        const auth = () => { generation.current++; setData(null); setEditing(false); setSaved(false); setReload(value => value + 1); };
        window.addEventListener("barticket-auth", auth);
        return () => {
            cancelled = true;
            // Invalidate pending writes as well; this counter is not a DOM ref.
            // eslint-disable-next-line react-hooks/exhaustive-deps
            generation.current++;
            window.removeEventListener("barticket-auth", auth);
        };
    }, [beneficiaryId, reload]);
    function begin() {
        if (!data?.can_edit || !policy?.tiers.length) return;
        setRows(policy.tiers.map(tier => ({threshold:String(tier.threshold_yen),rate:String(tier.rate_percent)})));
        setMonth(""); setReason(""); setSource(""); setSaved(false); setEditing(true);
    }
    const valid = Boolean(data && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= data.earliest_effective_month && reason.trim() && source.trim() && rows.length && rows.every(row => row.threshold.trim() && row.rate.trim() && Number.isSafeInteger(Number(row.threshold)) && Number.isSafeInteger(Number(row.rate))));
    async function save() {
        if (!data?.can_edit || !valid || pending.current || needsReload) return;
        const token = getToken(), request = generation.current;
        pending.current = true; setBusy(true); setError("");
        try {
            const result = await revenueSharePolicyApi.schedule({effective_month:month, tiers:rows.map(row=>({threshold_yen:Number(row.threshold),rate_percent:Number(row.rate)})),reason:reason.trim(),source:source.trim(),expected_revision:data.revision});
            if (request !== generation.current || getToken() !== token) return;
            if (result.beneficiary_user_id !== beneficiaryId) throw new Error("Policy beneficiary does not match");
            setData(result); setEditing(false); setSaved(true); onSaved();
        } catch (failure) {
            if (request === generation.current && getToken() === token) {
                if (failure instanceof ApiError && failure.status === 422) setError("invalid");
                else if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) { setData(null); setError("load"); }
                else { setError("save"); setNeedsReload(true); }
            }
        } finally { if (request === generation.current && getToken() === token) {pending.current=false;setBusy(false);} }
    }
    if (!data) return <Panel>{error ? <><p role="alert">{t("Policy history is unavailable or access is not permitted.","方針の履歴を読み込めないか、アクセス権限がありません。")}</p><button type="button" onClick={()=>setReload(value=>value+1)}>{t("Reload policy history","方針履歴を再読み込み")}</button></> : <p role="status">{t("Loading policy history…","方針履歴を読み込み中…")}</p>}</Panel>;
    const disabled=busy||needsReload;
    return <Panel aria-label={t("Revenue-share policy","歩合給の方針")}>
        <p>{t("A policy applies from the selected future month until a later scheduled policy begins. Existing later schedules remain. Current and historical calculations stay unchanged. Saving records a policy, not a payment.","選択した将来の月から、次の設定の開始月まで適用されます。既存のそれ以降の設定は維持されます。今月と過去の計算は変わりません。保存は方針の記録であり、支払ではありません。")}</p>
        {saved ? <p role="status">{t("Future policy saved.","将来の方針を保存しました。")}</p> : null}
        {data.can_edit && !editing ? <button type="button" disabled={!policy?.tiers.length} onClick={begin}>{t("Schedule a future policy","将来の方針を設定")}</button> : null}
        {data.can_edit && !policy?.tiers.length ? <p>{t("Load a verified policy for the selected month before starting a future schedule.","将来の設定を始める前に、選択月の確認済み方針を読み込んでください。")}</p> : null}
        {editing ? <form onSubmit={event=>{event.preventDefault();void save();}}>
            <fieldset disabled={disabled}>
                <legend>{t("Schedule a future policy","将来の方針を設定")}</legend>
                <label>{t("Effective month (Japan time)","適用開始月（日本時間）")}<input type="month" min={data.earliest_effective_month} required value={month} onChange={event=>setMonth(event.target.value)}/></label>
                <p>{t("Earliest allowed month: ","設定可能な最初の月：")}{data.earliest_effective_month}</p>
                <p>{t("Rates apply to the whole qualifying month. Enter ascending thresholds and rates; the server validates the schedule.","料率は対象月全体に適用されます。売上基準と料率を昇順で入力してください。設定内容はサーバーで検証されます。")}</p>
                {rows.map((row,index)=><Tier key={index}><label>{t("Sales threshold (¥)","売上基準（円）")} {index+1}<input type="number" min="0" step="1" required value={row.threshold} onChange={event=>setRows(previous=>previous.map((item,i)=>i===index?{...item,threshold:event.target.value}:item))}/></label><label>{t("Rate (%)","料率（%）")} {index+1}<input type="number" min="0" max="100" step="1" required value={row.rate} onChange={event=>setRows(previous=>previous.map((item,i)=>i===index?{...item,rate:event.target.value}:item))}/></label><button type="button" className="small hollow secondary" disabled={rows.length===1} onClick={()=>setRows(previous=>previous.filter((_,i)=>i!==index))}>{t("Remove tier","段階を削除")} {index+1}</button></Tier>)}
                <button type="button" className="small hollow secondary" onClick={()=>setRows(previous=>[...previous,{threshold:"",rate:""}])}>{t("Add tier","段階を追加")}</button>
                <label>{t("Reason","変更理由")}<textarea required value={reason} onChange={event=>setReason(event.target.value)}/></label>
                <label>{t("Agreement or source","合意・根拠")}<textarea required value={source} onChange={event=>setSource(event.target.value)}/></label>
                <button type="submit" disabled={!valid||disabled}>{busy?t("Saving…","保存中…"):t("Save future policy","将来の方針を保存")}</button>
                <button type="button" className="small hollow secondary" onClick={()=>setEditing(false)}>{t("Cancel","キャンセル")}</button>
            </fieldset>
            {error ? <p role="alert">{error === "invalid" ? t("The schedule was rejected. Check the future month, ascending sales thresholds and rates, reason and source.","設定が受け付けられませんでした。将来の月、昇順の売上基準と料率、変更理由、根拠を確認してください。") : t("Save could not be confirmed. Reload policy history before another attempt; this replaces your unsaved draft. The request will not be replayed.","保存を確認できません。再試行前に方針履歴を再読み込みしてください。未保存の内容は置き換わります。リクエストは自動再送されません。")}</p> : null}
            {needsReload ? <button type="button" onClick={()=>setReload(value=>value+1)}>{t("Reload policy history","方針履歴を再読み込み")}</button> : null}
        </form> : null}
        <h5>{t("Policy history","方針の履歴")}</h5>
        {data.versions.length ? data.versions.map(version=><details key={version.revision}><summary>{version.effective_month} · {t("Revision","改訂")} {version.revision}</summary><p>{version.reason}</p><p>{t("Source: ","根拠：")}{version.source}</p><p>{version.created_by_name} · {version.created_at}</p>{version.supersedes_revision!==null?<p>{t("Replaces revision ","置き換え前の改訂：")}{version.supersedes_revision}</p>:null}<ul>{version.tiers.map(tier=><li key={tier.threshold_yen}>¥{tier.threshold_yen.toLocaleString()} + → {tier.rate_percent}%</li>)}</ul></details>) : <p>{t("No scheduled policy changes. The existing confirmed schedule applies.","将来の変更は記録されていません。現在の確認済み方針が適用されます。")}</p>}
    </Panel>;
}
const Panel=styled.div`display:grid;gap:var(--space-2);min-width:0;overflow-wrap:anywhere;fieldset{min-width:0;display:grid;gap:var(--space-2);margin:0;}label{display:grid;gap:4px;min-width:0;}input,textarea{width:100%;min-width:0;box-sizing:border-box;font-size:16px;}button{white-space:normal;}p{margin:0;}`;
const Tier=styled.div`display:grid;grid-template-columns:1fr 1fr;gap:var(--space-1);min-width:0;button{grid-column:1/-1;}`;
