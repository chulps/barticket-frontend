import Dropdown from "./Select";
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import type { Ticket } from "../types/Ticket";
import { menuHaystack, menuLabel, useI18n } from "../i18n";
import { ticketsApi, toTicket } from "../api/tickets";
import { getToken } from "../api/client";
import { itemSales, saleShare, servicePeriod, validSalesRange, type SalesKind } from "./itemSales";

export default function ItemSalesPanel({ tickets, context, shiftDates, unknownDates = 0, summaryOnly = false }: { tickets: Ticket[]; context: string; shiftDates: ReadonlyMap<number, string>; unknownDates?: number; summaryOnly?: boolean }) {
    const { locale } = useI18n(); const ja = locale === "ja";
    const t = (en: string, jp: string) => ja ? jp : en;
    const yen = (n: number) => `¥${n.toLocaleString(ja ? "ja-JP" : "en-US")}`;
    const kindLabel = (kind: SalesKind) => kind === "menu" ? t("Menu items", "メニュー商品") : kind === "staff" ? t("Staff drinks", "スタッフドリンク") : t("Cover charges", "チャージ");
    const [from, setFrom] = useState(""); const [to, setTo] = useState("");
    const [custom, setCustom] = useState<{ tickets: Ticket[]; from: string; to: string; unknown: number; loadedAt: string } | null>(null);
    const [busy, setBusy] = useState(false); const [error, setError] = useState("");
    const [query, setQuery] = useState(""); const [sort, setSort] = useState("revenue"); const [page, setPage] = useState(0);
    const generation = useRef(0);
    useEffect(() => () => { generation.current++; }, []);
    async function loadRange(start = from, end = to) {
        if (!validSalesRange(start, end)) { setError(t("Choose a valid range of up to 366 days.", "366日以内の開始日と終了日を選択してください。")); return; }
        const request = ++generation.current; const token = getToken(); setBusy(true); setError("");
        try {
            const result = await ticketsApi.list({ date_from: start, date_to: end });
            if (request !== generation.current || token !== getToken()) return;
            const scoped = servicePeriod(result.map(toTicket), start, end, shiftDates);
            setCustom({ tickets: scoped.rows, from: start, to: end, unknown: scoped.unknownDates, loadedAt: new Date().toLocaleString() }); setPage(0);
        } catch { if (request === generation.current && token === getToken()) setError(t("Could not load this range. Previous results remain labeled below; retry.", "期間を読み込めませんでした。下には前回の期間を表示しています。再試行してください。")); }
        finally { if (request === generation.current) setBusy(false); }
    }
    const data = useMemo(() => itemSales(custom?.tickets ?? tickets), [custom, tickets]);
    const filtered = useMemo(() => data.items.filter(row => menuHaystack(row.name).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => sort === "quantity" ? b.quantity-a.quantity || b.revenue-a.revenue : sort === "name" ? menuLabel(locale,a.name).localeCompare(menuLabel(locale,b.name)) : b.revenue-a.revenue || b.quantity-a.quantity), [data, query, sort, locale]);
    const pages = Math.max(1, Math.ceil(filtered.length / 25)); const current = Math.min(page, pages - 1);
    return <Panel aria-label={t("All item sales", "全商品の販売実績")}>
        <h2>{t("All item sales", "全商品の販売実績")}</h2>
        <p>{custom ? `${custom.from} – ${custom.to}` : context}</p>
        {custom && <p role="status">{t("Snapshot loaded", "取得時刻")}: {custom.loadedAt} · {t("Not live. Refresh after corrections.", "自動更新ではありません。修正後は再読込してください。")} <button type="button" disabled={busy} onClick={()=>void loadRange(custom.from, custom.to)}>{t("Refresh results", "結果を再読込")}</button></p>}
        {!custom && summaryOnly && <p role="status">{t("Some historical period totals have no ticket item detail and are not included below.", "一部の過去の期間集計には商品明細がないため、以下に含まれません。")}</p>}
        <details><summary>{t("Custom date range", "期間を指定")}</summary>
            <Controls><label>{t("From", "開始日")}<input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label><label>{t("To", "終了日")}<input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
            <button type="button" disabled={busy} onClick={()=>void loadRange()}>{busy ? t("Loading…", "読み込み中…") : t("Apply dates", "期間を適用")}</button>
            {custom && <button type="button" onClick={()=>{ generation.current++; setBusy(false); setCustom(null); setError(""); setPage(0); }}>{t("Use report period", "レポートの期間を使用")}</button>}</Controls>
        </details>
        {error && <p role="alert">{error}</p>}
        <p>{t("Service dates · fully paid tickets · recorded line amounts, not current menu prices. Revenue share uses ALL item lines below, including covers and staff drinks; search does not change that denominator.", "営業日基準・全額支払済み伝票・現在価格ではなく記録済み明細金額。売上構成比はチャージ・スタッフドリンクを含む全明細が分母です。検索しても分母は変わりません。")}</p>
        <strong>{t("Recorded item revenue", "記録済み商品売上")}: {yen(data.revenue)}</strong>
        <p>{t("This is not cash collected during the period. Unpaid, cancelled, audited refund/cancellation or written-off tickets are excluded. Historical totals without item details cannot be attributed; refunds without item allocation cannot be shown as per-item net revenue.", "この期間の入金額とは異なります。未払い・取消（監査済み返金を含む）・貸倒の伝票は除外。明細のない過去の集計や商品別に配分されていない返金は、商品別純売上に換算できません。")}</p>
        {(data.excludedTickets > 0 || data.invalidLines > 0 || (custom?.unknown ?? unknownDates) > 0) && <p role="status">{t("Excluded tickets / invalid lines / unknown service dates", "除外伝票／不正な明細／営業日不明")}: {data.excludedTickets} / {data.invalidLines} / {custom?.unknown ?? unknownDates}</p>}
        <Breakdown>{data.breakdown.map(row=><div key={row.kind}><span>{kindLabel(row.kind)}</span><strong>{yen(row.revenue)} · {saleShare(row.revenue,data.revenue).toFixed(1)}%</strong><meter min={0} max={100} value={saleShare(row.revenue,data.revenue)} aria-label={kindLabel(row.kind)} /></div>)}</Breakdown>
        <details><summary>{t("Staff drinks by team member", "スタッフ別ドリンク実績")}</summary>
            <p>{t("Recorded staff drinks on the same fully paid tickets. This breakdown is already included in item revenue, not added again. Records without a staff ID are shown as unattributed, never guessed from names.", "同じ全額支払済み伝票に記録されたスタッフドリンク。商品売上に含まれる内訳であり、二重加算しません。スタッフIDのない記録は氏名から推定せず、未割当として表示します。")}</p>
            {!data.staff.length ? <p>{t("No staff drinks on fully paid tickets in this period.", "この期間の全額支払済み伝票にスタッフドリンクはありません。")}</p> : <Scroll><table><thead><tr><th>{t("Team member", "スタッフ")}</th><th>{t("Units", "数量")}</th><th>{t("Revenue", "売上")}</th><th>{t("Share of staff-drink revenue", "スタッフドリンク売上構成比")}</th></tr></thead><tbody>{data.staff.map(person=><tr key={person.id}><td>{person.attributed ? `${person.name}${data.staff.filter(p=>p.attributed && p.name === person.name).length > 1 ? ` (#${person.id.slice(6)})` : ""}` : t("Unattributed", "未割当")}</td><td>{person.quantity.toLocaleString()}</td><td>{yen(person.revenue)}</td><td>{saleShare(person.revenue,data.breakdown.find(r=>r.kind === "staff")?.revenue ?? 0).toFixed(1)}%</td></tr>)}</tbody></table></Scroll>}
        </details>
        <Controls><label>{t("Search items", "商品検索")}<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} /></label><label>{t("Sort by", "並び順")}<Dropdown value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="revenue">{t("Revenue", "売上")}</option><option value="quantity">{t("Quantity", "数量")}</option><option value="name">{t("Name", "名前")}</option></Dropdown></label></Controls>
        {!filtered.length ? <p>{data.items.length ? t("No matching items.", "該当する商品がありません。") : t("No attributable paid item sales for this period.", "この期間に集計できる支払済み商品明細はありません。")}</p> : <Scroll><table><caption>{t("All items; 25 per page. Expand an item for serving-size and historical-price breakdown.", "全商品・1ページ25件。商品を展開すると提供量・過去の価格別内訳を表示。")}</caption><thead><tr><th>{t("Item / breakdown", "商品／内訳")}</th><th>{t("Units", "数量")}</th><th>{t("Revenue", "売上")}</th><th>{t("Share", "構成比")}</th></tr></thead><tbody>{filtered.slice(current*25,current*25+25).map(row=><tr key={row.id}><td><details><summary>{row.kind === "cover" ? kindLabel(row.kind) : menuLabel(locale,row.name)}</summary><small>{kindLabel(row.kind)}</small><ul>{row.variants.map(v=><li key={`${v.label}:${v.unitPrice}`}>{v.label} · {yen(v.unitPrice)} × {v.quantity} → {yen(v.revenue)}</li>)}</ul></details></td><td>{row.quantity.toLocaleString()}</td><td>{yen(row.revenue)}</td><td>{saleShare(row.revenue,data.revenue).toFixed(1)}%<meter min={0} max={100} value={saleShare(row.revenue,data.revenue)} aria-label={`${row.name} ${t("share", "構成比")}`} /></td></tr>)}</tbody></table></Scroll>}
        <Controls><span>{filtered.length} {t("items", "商品")} · {current+1} / {pages}</span><button type="button" disabled={current===0} onClick={()=>setPage(current-1)}>{t("Previous", "前へ")}</button><button type="button" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>{t("Next", "次へ")}</button></Controls>
    </Panel>;
}
const Panel = styled.section`background:var(--neutral-900);border-radius:12px;padding:var(--space-2);margin-top:var(--space-2); h2{margin-top:0} p,caption{color:var(--neutral-300);line-height:1.5} meter{display:block;width:100%;min-width:5rem} summary{cursor:pointer;overflow-wrap:anywhere} input,select{max-width:100%;color:inherit;background:var(--neutral-800);padding:.5rem;border:1px solid var(--neutral-500);border-radius:6px}`;
const Controls = styled.div`display:flex;flex-wrap:wrap;gap:1rem;align-items:end;margin:1rem 0;label{display:grid;gap:.3rem;min-width:0}button{margin:0}`;
const Breakdown = styled.div`display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin:1rem 0;div{display:grid;gap:.4rem}`;
const Scroll = styled.div`overflow-x:auto;table{width:100%;border-collapse:collapse}th,td{padding:.75rem;text-align:right;border-bottom:1px solid var(--neutral-700)}th:first-child,td:first-child{text-align:left;min-width:180px}caption{text-align:left;margin-bottom:.5rem}td{vertical-align:top}li{text-align:left}`;
