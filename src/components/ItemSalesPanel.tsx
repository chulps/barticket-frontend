import Dropdown from "./Select";
import { useMemo, useRef, useState } from "react";
import styled from "styled-components";
import type { Ticket } from "../types/Ticket";
import { menuHaystack, menuLabel, useI18n } from "../i18n";
import { itemSales, itemRevenueColor, revenueComposition, saleShare, type SalesKind } from "./itemSales";

export default function ItemSalesPanel({ tickets, context, unknownDates = 0, summaryOnly = false }: { tickets: Ticket[]; context: string; unknownDates?: number; summaryOnly?: boolean }) {
    const { locale } = useI18n(); const ja = locale === "ja";
    const t = (en: string, jp: string) => ja ? jp : en;
    const yen = (n: number) => `¥${n.toLocaleString(ja ? "ja-JP" : "en-US")}`;
    const kindLabel = (kind: SalesKind) => kind === "menu" ? t("Menu items", "メニュー商品") : kind === "staff" ? t("Staff drinks", "スタッフドリンク") : t("Cover charges", "チャージ");
    const [query, setQuery] = useState(""); const [sort, setSort] = useState("revenue"); const [page, setPage] = useState(0);
    const data = useMemo(() => itemSales(tickets), [tickets]);
    const [selection, setSelection] = useState<{id:string; tickets:Ticket[]} | null>(null);
    const cards = useRef(new Map<string, HTMLLIElement>());
    const legend = useRef<HTMLDivElement>(null);
    const composition = useMemo(() => revenueComposition(data), [data]);
    const selectedId = selection?.tickets === tickets && composition.some(row=>row.id === selection.id) ? selection.id : null;
    function selectSegment(id: string) {
        if (selectedId === id) { setSelection(null); return; }
        setSelection({id,tickets});
        const card = cards.current.get(id);
        if (card && legend.current) legend.current.scrollTop = card.offsetTop - legend.current.offsetTop;
    }
    const compositionName = (row: typeof composition[number]) => row.kind === "cover" ? kindLabel(row.kind) : row.kind === "staff"
        ? `${row.attributed ? `${row.staffName}${data.staff.filter(p=>p.attributed && p.name === row.staffName).length > 1 ? ` (#${row.staffId?.slice(6)})` : ""}` : t("Unattributed", "未割当")} · ${menuLabel(locale,row.name)} · ${kindLabel("staff")}`
        : menuLabel(locale,row.name);
    const filtered = useMemo(() => data.items.filter(row => menuHaystack(row.name).toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => sort === "quantity" ? b.quantity-a.quantity || b.revenue-a.revenue : sort === "name" ? menuLabel(locale,a.name).localeCompare(menuLabel(locale,b.name)) : b.revenue-a.revenue || b.quantity-a.quantity), [data, query, sort, locale]);
    const pages = Math.max(1, Math.ceil(filtered.length / 25)); const current = Math.min(page, pages - 1);
    return <Panel aria-label={t("All item sales", "全商品の販売実績")}>
        <h2>{t("All item sales", "全商品の販売実績")}</h2>
        <p>{context}</p>
        {summaryOnly && <p role="status">{t("Some historical period totals have no ticket item detail and are not included below.", "一部の過去の期間集計には商品明細がないため、以下に含まれません。")}</p>}
        <Total><span>{t("Recorded item revenue", "記録済み商品売上")}</span><strong>{yen(data.revenue)}</strong></Total>
        <p>{t("Service dates · fully paid tickets · historical line amounts", "営業日基準・全額支払済み伝票・記録済み明細金額")}</p>

        {(data.excludedTickets > 0 || data.invalidLines > 0 || unknownDates > 0) && <p role="status">{t("Excluded tickets / invalid lines / unknown service dates", "除外伝票／不正な明細／営業日不明")}: {data.excludedTickets} / {data.invalidLines} / {unknownDates}</p>}
        <Composition aria-label={t("Item revenue composition", "商品別売上構成")}>
            <h3>{t("Item revenue composition", "商品別売上構成")}</h3>
            <p>{t("Every item, including each team member’s staff drinks. No Other bucket. Share is of all recorded paid item revenue; search does not change this chart.", "全商品とスタッフ別ドリンクを個別表示。「その他」への集約はありません。記録済み支払済み商品売上全体に対する構成比で、検索しても変わりません。")}</p>
            {data.revenue > 0 ? <>
                <p>{t("Select a segment or item to highlight it. Select it again to clear.", "区分または商品を選択すると強調表示します。もう一度選択すると解除します。")}</p>
                {selectedId && <button type="button" className="secondary clear-selection" onClick={()=>setSelection(null)}>{t("Clear selection", "選択を解除")}</button>}
                <div className="stack" role="group" aria-label={t("Select a revenue segment", "売上区分を選択")}>{composition.map((row,index)=><button type="button" key={row.id} className="segment" style={{width:`${saleShare(row.revenue,data.revenue)}%`,background:itemRevenueColor(index)}} aria-label={`${compositionName(row)}: ${yen(row.revenue)} (${saleShare(row.revenue,data.revenue).toFixed(1)}%)`} aria-pressed={selectedId === row.id} onClick={()=>selectSegment(row.id)} title={`${index+1}. ${compositionName(row)}: ${yen(row.revenue)} (${saleShare(row.revenue,data.revenue).toFixed(1)}%)`} />)}</div>
                <div className="legend-scroll" ref={legend} tabIndex={0} role="region" aria-label={t("All chart items", "グラフの全商品")}><ol>{composition.map((row,index)=><li key={row.id} ref={node=>{if(node) cards.current.set(row.id,node);else cards.current.delete(row.id);}} data-dimmed={selectedId !== null && selectedId !== row.id} data-selected={selectedId === row.id}><button type="button" className="legend-item" aria-pressed={selectedId === row.id} onClick={()=>selectSegment(row.id)}><span className="swatch" style={{background:itemRevenueColor(index)}} aria-hidden="true" /><span className="legend-copy"><span className="item-label">{index+1}. {compositionName(row)}</span><strong>{yen(row.revenue)} <span>· {saleShare(row.revenue,data.revenue).toFixed(1)}%</span></strong><small>{row.quantity.toLocaleString()} {t("units", "点")}</small></span></button></li>)}</ol></div>
            </> : <p>{t("No paid item revenue to chart in this period.", "この期間にグラフ表示できる支払済み商品売上はありません。")}</p>}

        </Composition>
        <StaffBreakdown aria-label={t("Staff drinks by team member", "スタッフ別ドリンク実績")}>
            <h3>{t("Staff drinks by team member", "スタッフ別ドリンク実績")}</h3>
            <p>{t("Fully paid tickets only. Included in item revenue above, not added again. Missing staff IDs stay unattributed.", "全額支払済み伝票のみ。上記商品売上に含まれ、二重加算しません。スタッフIDがない場合は未割当として表示します。")}</p>
            {!data.staff.length ? <p>{t("No staff drinks on fully paid tickets in this period.", "この期間の全額支払済み伝票にスタッフドリンクはありません。")}</p> : <Scroll><table>
                <thead><tr><th>{t("Team member / drink", "スタッフ／ドリンク")}</th><th>{t("Units", "数量")}</th><th>{t("Revenue", "売上")}</th><th>{t("Share of staff-drink revenue", "スタッフドリンク売上構成比")}</th></tr></thead>
                {data.staff.map(person=><tbody key={person.id}>
                    <tr className="staff-total"><th scope="row">{person.attributed ? `${person.name}${data.staff.filter(p=>p.attributed && p.name === person.name).length > 1 ? ` (#${person.id.slice(6)})` : ""}` : t("Unattributed", "未割当")}</th><td>{person.quantity.toLocaleString()}</td><td>{yen(person.revenue)}</td><td>{saleShare(person.revenue,data.breakdown.find(r=>r.kind === "staff")?.revenue ?? 0).toFixed(1)}%</td></tr>
                    {person.items.map(drink=><tr key={drink.id}><th scope="row" className="staff-drink">{menuLabel(locale,drink.name)}</th><td>{drink.quantity.toLocaleString()}</td><td>{yen(drink.revenue)}</td><td>{saleShare(drink.revenue,data.breakdown.find(r=>r.kind === "staff")?.revenue ?? 0).toFixed(1)}%</td></tr>)}
                </tbody>)}
            </table></Scroll>}
        </StaffBreakdown>
        <Controls><label>{t("Search items", "商品検索")}<input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);setSelection(null);}} /></label><label>{t("Sort by", "並び順")}<Dropdown value={sort} onChange={e=>{setSort(e.target.value);setPage(0);setSelection(null);}}><option value="revenue">{t("Revenue", "売上")}</option><option value="quantity">{t("Quantity", "数量")}</option><option value="name">{t("Name", "名前")}</option></Dropdown></label></Controls>
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
    .stack{display:flex;width:100%;height:var(--space-3);border-radius:8px;overflow:hidden;background:var(--neutral-800)}.stack .segment{display:block;min-width:0;height:100%;margin:0;padding:0;border:0;border-radius:0;box-shadow:inset 1px 0 var(--neutral-900);flex-shrink:0;transition:none}.stack .segment:hover{filter:brightness(1.12)}.stack .segment:focus-visible,.stack .segment[aria-pressed="true"]{outline:2px solid var(--neutral-100);outline-offset:-2px}.clear-selection{align-self:flex-start}
    .legend-scroll{position:relative;max-height:36rem;overflow:auto;min-width:0;scrollbar-gutter:stable}.legend-scroll:focus-visible{outline:2px solid var(--primary);outline-offset:2px}
    ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-1)}
    li{min-width:0;border:1px solid var(--neutral-700);border-radius:8px;background:var(--neutral-800)}
    li[data-dimmed="true"]{opacity:.35}li[data-selected="true"]{border-color:var(--royal-300);box-shadow:0 0 0 1px var(--royal-300)}
    .legend-item{display:grid;grid-template-columns:.75rem minmax(0,1fr);gap:var(--space-1);padding:var(--space-1);width:100%;margin:0;border:0;background:transparent;color:inherit;text-align:left;border-radius:8px;white-space:normal;box-shadow:none;min-height:44px}.legend-item:hover{background:var(--neutral-700)}.legend-item:focus-visible{outline:2px solid var(--royal-300);outline-offset:2px}
    .legend-copy{min-width:0;display:flex;flex-direction:column;gap:var(--space-0)}.item-label{color:var(--neutral-300);font-size:var(--font-size-small);line-height:1.25;overflow-wrap:anywhere}
    strong{font-family:var(--font-family-data);font-size:var(--font-size-h5);font-weight:500;font-variant-numeric:tabular-nums;line-height:1.25;overflow-wrap:anywhere}strong span,small{color:var(--neutral-400);font-size:var(--font-size-small)}
    .swatch{width:.75rem;height:.75rem;margin-top:.2rem;border-radius:3px}
    @media(min-width:640px){ol{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(min-width:1024px){ol{grid-template-columns:repeat(4,minmax(0,1fr))}}
`;

const StaffBreakdown = styled.section`
    display:flex;flex-direction:column;gap:var(--space-1);min-width:0;margin-block:var(--space-1);
    .staff-total{background:var(--neutral-800)}.staff-total th{color:var(--neutral-100)}
    th.staff-drink{padding-left:var(--space-2);color:var(--neutral-300)}
`;
