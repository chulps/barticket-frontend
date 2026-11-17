import Dropdown from "./Select";
import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import type { Ticket } from "../types/Ticket";
import { menuHaystack, menuLabel, useI18n } from "../i18n";
import { ticketsApi, toTicket } from "../api/tickets";
import { getToken } from "../api/client";
import { itemSales, revenueComposition, saleShare, servicePeriod, validSalesRange, type SalesKind } from "./itemSales";

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
    const composition = useMemo(() => revenueComposition(data), [data]);
    const colors = ["var(--royal-300)", "var(--electric-500)", "var(--warning)", "var(--success)", "var(--royal-500)", "var(--neutral-300)"];
    const compositionName = (row: typeof composition[number]) => row.kind === "cover" ? kindLabel(row.kind) : row.kind === "staff"
        ? `${row.attributed ? `${row.staffName}${data.staff.filter(p=>p.attributed && p.name === row.staffName).length > 1 ? ` (#${row.staffId?.slice(6)})` : ""}` : t("Unattributed", "未割当")} · ${menuLabel(locale,row.name)} · ${kindLabel("staff")}`
        : menuLabel(locale,row.name);
    const filtered = useMemo(() => data.items.filter(row => menuHaystack(row.name).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => sort === "quantity" ? b.quantity-a.quantity || b.revenue-a.revenue : sort === "name" ? menuLabel(locale,a.name).localeCompare(menuLabel(locale,b.name)) : b.revenue-a.revenue || b.quantity-a.quantity), [data, query, sort, locale]);
    const pages = Math.max(1, Math.ceil(filtered.length / 25)); const current = Math.min(page, pages - 1);
    return <Panel aria-label={t("All item sales", "全商品の販売実績")}>
        <h2>{t("All item sales", "全商品の販売実績")}</h2>
        <p>{custom ? `${custom.from} – ${custom.to}` : context}</p>
        {custom && <p role="status">{t("Snapshot loaded", "取得時刻")}: {custom.loadedAt} · {t("Not live. Refresh after corrections.", "自動更新ではありません。修正後は再読込してください。")} <button type="button" className="secondary" disabled={busy} onClick={()=>void loadRange(custom.from, custom.to)}>{t("Refresh results", "結果を再読込")}</button></p>}
        {!custom && summaryOnly && <p role="status">{t("Some historical period totals have no ticket item detail and are not included below.", "一部の過去の期間集計には商品明細がないため、以下に含まれません。")}</p>}
        <details><summary>{t("Custom date range", "期間を指定")}</summary>
            <Controls><label>{t("From", "開始日")}<input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label><label>{t("To", "終了日")}<input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
            <button type="button" className="secondary" disabled={busy} onClick={()=>void loadRange()}>{busy ? t("Loading…", "読み込み中…") : t("Apply dates", "期間を適用")}</button>
            {custom && <button type="button" className="secondary" onClick={()=>{ generation.current++; setBusy(false); setCustom(null); setError(""); setPage(0); }}>{t("Use report period", "レポートの期間を使用")}</button>}</Controls>
        </details>
        {error && <p role="alert">{error}</p>}
        <Total><span>{t("Recorded item revenue", "記録済み商品売上")}</span><strong>{yen(data.revenue)}</strong></Total>
        <p>{t("Service dates · fully paid tickets · historical line amounts", "営業日基準・全額支払済み伝票・記録済み明細金額")}</p>
        <details><summary>{t("How this is calculated", "集計方法")}</summary><p>{t("Revenue share uses all recorded item lines, including cover charges and staff drinks. Search does not change the denominator. This is not cash collected during the period. Unpaid, cancelled, audited refund/cancellation and written-off tickets are excluded. Historical totals without item details cannot be attributed; refunds without item allocation cannot be shown as per-item net revenue.", "売上構成比はチャージ・スタッフドリンクを含む全明細が分母です。検索しても分母は変わりません。この期間の入金額とは異なります。未払い・取消（監査済み返金を含む）・貸倒の伝票は除外。明細のない過去の集計や商品別に配分されていない返金は商品別純売上に換算できません。")}</p></details>
        {(data.excludedTickets > 0 || data.invalidLines > 0 || (custom?.unknown ?? unknownDates) > 0) && <p role="status">{t("Excluded tickets / invalid lines / unknown service dates", "除外伝票／不正な明細／営業日不明")}: {data.excludedTickets} / {data.invalidLines} / {custom?.unknown ?? unknownDates}</p>}
        <Composition aria-label={t("Item revenue composition", "商品別売上構成")}>
            <h3>{t("Item revenue composition", "商品別売上構成")}</h3>
            <p>{t("Every item, including each team member’s staff drinks. No Other bucket. Share is of all recorded paid item revenue; search does not change this chart.", "全商品とスタッフ別ドリンクを個別表示。「その他」への集約はありません。記録済み支払済み商品売上全体に対する構成比で、検索しても変わりません。")}</p>
            {data.revenue > 0 ? <><div className="stack" aria-hidden="true">{composition.map((row,index)=><span key={row.id} style={{width:`${saleShare(row.revenue,data.revenue)}%`,background:colors[index % colors.length]}} title={`${index+1}. ${compositionName(row)}: ${yen(row.revenue)} (${saleShare(row.revenue,data.revenue).toFixed(1)}%)`} />)}</div><div className="legend-scroll" tabIndex={0} role="region" aria-label={t("All chart items", "グラフの全商品")}><ol>{composition.map((row,index)=><li key={row.id}><span className="swatch" style={{background:colors[index % colors.length]}} aria-hidden="true" /><div><span className="item-label">{index+1}. {compositionName(row)}</span><strong>{yen(row.revenue)} <span>· {saleShare(row.revenue,data.revenue).toFixed(1)}%</span></strong><small>{row.quantity.toLocaleString()} {t("units", "点")}</small></div></li>)}</ol></div></> : <p>{t("No paid item revenue to chart in this period.", "この期間にグラフ表示できる支払済み商品売上はありません。")}</p>}
        </Composition>
        <details><summary>{t("Staff drinks by team member", "スタッフ別ドリンク実績")}</summary>
            <p>{t("Recorded staff drinks on the same fully paid tickets. This breakdown is already included in item revenue, not added again. Records without a staff ID are shown as unattributed, never guessed from names.", "同じ全額支払済み伝票に記録されたスタッフドリンク。商品売上に含まれる内訳であり、二重加算しません。スタッフIDのない記録は氏名から推定せず、未割当として表示します。")}</p>
            {!data.staff.length ? <p>{t("No staff drinks on fully paid tickets in this period.", "この期間の全額支払済み伝票にスタッフドリンクはありません。")}</p> : <Scroll><table><thead><tr><th>{t("Team member", "スタッフ")}</th><th>{t("Units", "数量")}</th><th>{t("Revenue", "売上")}</th><th>{t("Share of staff-drink revenue", "スタッフドリンク売上構成比")}</th></tr></thead><tbody>{data.staff.map(person=><tr key={person.id}><td>{person.attributed ? `${person.name}${data.staff.filter(p=>p.attributed && p.name === person.name).length > 1 ? ` (#${person.id.slice(6)})` : ""}` : t("Unattributed", "未割当")}</td><td>{person.quantity.toLocaleString()}</td><td>{yen(person.revenue)}</td><td>{saleShare(person.revenue,data.breakdown.find(r=>r.kind === "staff")?.revenue ?? 0).toFixed(1)}%</td></tr>)}</tbody></table></Scroll>}
        </details>
        <Controls><label>{t("Search items", "商品検索")}<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} /></label><label>{t("Sort by", "並び順")}<Dropdown value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="revenue">{t("Revenue", "売上")}</option><option value="quantity">{t("Quantity", "数量")}</option><option value="name">{t("Name", "名前")}</option></Dropdown></label></Controls>
        {!filtered.length ? <p>{data.items.length ? t("No matching items.", "該当する商品がありません。") : t("No attributable paid item sales for this period.", "この期間に集計できる支払済み商品明細はありません。")}</p> : <Scroll><table><caption>{t("All items; 25 per page. Expand an item for serving-size and historical-price breakdown.", "全商品・1ページ25件。商品を展開すると提供量・過去の価格別内訳を表示。")}</caption><thead><tr><th>{t("Item / breakdown", "商品／内訳")}</th><th>{t("Units", "数量")}</th><th>{t("Revenue", "売上")}</th><th>{t("Share", "構成比")}</th></tr></thead><tbody>{filtered.slice(current*25,current*25+25).map(row=><tr key={row.id}><td><details><summary>{row.kind === "cover" ? kindLabel(row.kind) : menuLabel(locale,row.name)}</summary><small>{kindLabel(row.kind)}</small><ul>{row.variants.map(v=><li key={`${v.label}:${v.unitPrice}`}>{v.label} · {yen(v.unitPrice)} × {v.quantity} → {yen(v.revenue)}</li>)}</ul></details></td><td>{row.quantity.toLocaleString()}</td><td>{yen(row.revenue)}</td><td>{saleShare(row.revenue,data.revenue).toFixed(1)}%</td></tr>)}</tbody></table></Scroll>}
        <Controls><span>{filtered.length} {t("items", "商品")} · {current+1} / {pages}</span><button type="button" className="secondary" disabled={current===0} onClick={()=>setPage(current-1)}>{t("Previous", "前へ")}</button><button type="button" className="secondary" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>{t("Next", "次へ")}</button></Controls>
    </Panel>;
}
const Panel = styled.section`
    background:var(--neutral-900);border-radius:12px;padding:var(--space-2);margin-top:var(--space-2);min-width:0;display:flex;flex-direction:column;gap:var(--space-1);
    h2,h3{margin:0;font-size:var(--font-size-h5);line-height:1.2;font-weight:500}
    p,caption{margin:0;color:var(--neutral-400);font-size:var(--font-size-small);line-height:var(--line-height-default)}
    summary{cursor:pointer;overflow-wrap:anywhere;font-size:var(--font-size-h5);font-weight:500;padding-block:var(--space-1)}
    summary:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    input{min-width:0;max-width:100%;box-sizing:border-box;width:100%}
    details>p{margin-top:var(--space-1)}
`;
const Total = styled.div`display:flex;flex-wrap:wrap;align-items:baseline;gap:var(--space-1);span{font-size:var(--font-size-small);color:var(--neutral-300)}strong{font-family:var(--font-family-data);font-size:var(--font-size-h4);font-weight:500;font-variant-numeric:tabular-nums}`;
const Controls = styled.div`display:flex;flex-wrap:wrap;gap:var(--space-1);align-items:end;margin:var(--space-1) 0;label{display:grid;gap:var(--space-0);min-width:0;flex:1 1 180px;color:var(--neutral-300);font-size:var(--font-size-small)}button{margin:0;min-height:44px;max-width:100%}@media(max-width:480px){label{flex-basis:100%}}`;
const Scroll = styled.div`overflow-x:auto;min-width:0;table{width:100%;border-collapse:collapse}th,td{padding:var(--space-1);text-align:right;border-bottom:1px solid var(--neutral-700);font-size:var(--font-size-small)}th{color:var(--neutral-300);font-weight:500}td:not(:first-child){font-family:var(--font-family-data);font-variant-numeric:tabular-nums;white-space:nowrap}th:first-child,td:first-child{text-align:left;min-width:180px}caption{text-align:left;margin-bottom:var(--space-1)}td{vertical-align:top}li{text-align:left}`;
const Composition = styled.section`
    margin:var(--space-1) 0;min-width:0;display:flex;flex-direction:column;gap:var(--space-1);
    .stack{display:flex;width:100%;height:var(--space-3);border-radius:8px;overflow:hidden;background:var(--neutral-800)}.stack span{display:block;min-width:0}
    .legend-scroll{max-height:36rem;overflow:auto;min-width:0;scrollbar-gutter:stable}.legend-scroll:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-1)}
    li{display:grid;grid-template-columns:.75rem minmax(0,1fr);gap:var(--space-1);padding:var(--space-1);min-width:0;border:1px solid var(--neutral-700);border-radius:8px;background:var(--neutral-800)}
    li>div{min-width:0;display:flex;flex-direction:column;gap:var(--space-0)}.item-label{color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.25;overflow-wrap:anywhere}
    strong{font-family:var(--font-family-data);font-size:var(--font-size-h5);font-weight:500;font-variant-numeric:tabular-nums;line-height:1.25;overflow-wrap:anywhere}strong span,small{color:var(--neutral-400);font-size:var(--font-size-small)}
    .swatch{width:.75rem;height:.75rem;margin-top:.2rem;border-radius:3px}
    @media(min-width:640px){ol{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1024px){ol{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;
