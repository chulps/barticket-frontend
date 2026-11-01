import styled from "styled-components";
import type { ChuckMonthlyPayPreview } from "../api/account";
import { localeTag, type Locale } from "../i18n";
import { buildChuckPayBreakdown } from "./chuckPayBreakdown";
import { DonutChart } from "../components/AnalyticsCharts";
import { chuckPayDisplay } from "./chuckPayDisplay";

export default function ChuckPayBreakdown({ report, locale }: { report: ChuckMonthlyPayPreview; locale: Locale }) {
    const ja = locale === "ja";
    const data = buildChuckPayBreakdown(report);
    const partial = chuckPayDisplay(report).staffSubtotalPartial;
    const money = (value: number | null) => value == null ? "—" : new Intl.NumberFormat(localeTag(locale), {
        style: "currency", currency: "JPY", maximumFractionDigits: 0,
    }).format(value);
    const chartSlices = data.retained !== null && data.retained >= 0 && report.deduction_total_yen >= 0 &&
        data.staff.every(person => person.total !== null && person.total >= 0) ? [
        { id:"retained", label:ja ? "自分の取り分" : "Your remaining share", value:data.retained, display:money(data.retained), color:"var(--royal-400)" },
        ...data.staff.map((person, index) => ({id:`staff-${person.id}`, label:person.name, value:person.total ?? 0,
            display:money(person.total), color:["var(--success-400)", "var(--warning-400)", "var(--neutral-400)"][index % 3]})),
        { id:"deductions", label:ja ? "記録済み控除" : "Recorded deductions", value:report.deduction_total_yen,
            display:money(report.deduction_total_yen), color:"var(--danger-400)" },
    ] : [];
    const categories: Record<string, string> = {
        manager_pay_deduction: ja ? "マネージャー給与控除" : "Manager-pay deduction",
        manager_paid_staff_tip: ja ? "マネージャー負担のスタッフチップ" : "Manager-paid staff tip",
        language_exchange_commission: ja ? "言語交流イベント手数料" : "Language-exchange commission",
        staff_drink_bonus_adjustment: ja ? "スタッフドリンク手当調整" : "Staff-drink bonus adjustment",
    };
    return <Section aria-label={ja ? "売上から給与までの内訳" : "Revenue to pay breakdown"}>
        <Flow>
            <Line><dt>{ja ? "Chuck担当シフトの対象売上" : "Eligible revenue on your managed shifts"}</dt><dd>{money(report.eligible_revenue_yen)}</dd></Line>
            <Line><dt>{ja ? "給与配分率" : "Your revenue-share rate"}</dt><dd>{report.tier_rate_percent == null ? "—" : `${report.tier_rate_percent}%`}</dd></Line>
            <Line><dt>{ja ? "スタッフ給与・控除前の自分の取り分" : "Your gross share before staff pay and deductions"}</dt><dd>{money(report.gross_salary_yen)}</dd></Line>
            <Line><dt>{partial ? (ja ? "記録済みスタッフ給与の小計（一部）" : "Recorded staff pay subtotal (partial)") : (ja ? "スタッフ給与" : "Staff pay")}</dt><dd>{money(report.staff_cost_total_yen)}</dd></Line>
            <Line><dt>{ja ? "記録済み控除（取消を含む）" : "Recorded deductions, net of reversals"}</dt><dd>{money(report.deduction_total_yen)}</dd></Line>
            <Line $total><dt>{ja ? "差引後の自分の取り分（見積もり）" : "Your remaining share (estimate)"}</dt><dd>{money(data.retained)}</dd></Line>
        </Flow>
        <Note>{ja ? "対象売上 × 配分率 = 総取り分。総取り分 − スタッフ給与 − 記録済み控除 = 差引後の見積もり。売上の全額が自分の給与になるわけではありません。" : "Eligible revenue × share rate = gross share. Gross share − staff pay − recorded deductions = remaining estimate. Not all managed-shift revenue is your pay."}</Note>
        {partial ? <Warning>{ja ? "未確認の勤務時間などは含まれません。スタッフ給与の小計は一部のみで、最終的な支払額ではありません。" : "Missing or unverified inputs are not included. The staff-pay subtotal is partial, not the final amount owed."}</Warning> : null}
        {data.inconsistent ? <Warning role="status">{ja ? "内訳と合計が一致しないため、差引後の金額は確認が必要です。" : "The breakdown does not reconcile with the totals; the remaining amount needs review."}</Warning> : null}
        {chartSlices.length > 0 && (report.gross_salary_yen ?? 0) > 0 ? <DonutChart
            title={ja ? "総取り分の配分" : "Gross share allocation"} slices={chartSlices}
            center={money(report.gross_salary_yen)} locale={locale}
            note={ja ? "自分の取り分・スタッフ別給与・記録済み控除の配分です。" : "Your remaining share, each staff member’s pay, and recorded deductions."} /> : null}
        <h3>{ja ? "スタッフ別の配分" : "What goes to each staff member"}</h3>
        {data.staff.length ? <List aria-label={ja ? "スタッフ別給与の明細" : "Staff pay entries"}>{data.staff.map(person => <Item key={person.id}>
            <div><strong>{person.name}</strong><Note>{ja ? "賃金" : "Wages"} {money(person.wages)} · {ja ? "スタッフドリンク手当" : "Staff-drink bonus"} {money(person.drinks)}</Note></div>
            <Amount>{money(person.total)}</Amount>
        </Item>)}</List> : <Note>{ja ? "この月の担当シフトにスタッフ給与の記録はありません。記録がないことは、スタッフがいなかったことの確認ではありません。" : "No staff-pay records for your managed shifts this month. Missing records do not confirm that no staff worked."}</Note>}
        <h3>{ja ? "給与からの記録済み控除" : "Recorded deductions from your share"}</h3>
        {data.deductions.length ? <List aria-label={ja ? "控除の明細" : "Deduction entries"}>{data.deductions.map(item => <Item key={item.id}>
            <div><strong>{categories[item.category] ?? item.category}</strong><Note>{item.business_date}{item.payee_name ? ` · ${item.payee_name}` : ""}</Note><p>{item.reason}</p>
                {item.reversal_of_id !== null ? <Note>{ja ? "取消元の記録" : "Reversal of entry"} #{item.reversal_of_id}</Note> : null}</div>
            <Amount>{money(item.amount_yen)}</Amount>
        </Item>)}</List> : <Note>{ja ? "控除は記録されていません。未記録の現金引出しや支払いがないことを意味するものではありません。" : "No deductions are recorded. This does not confirm that there were no unrecorded withdrawals or payments."}</Note>}
        <Note>{ja ? "正の控除は取り分を減らし、負の取消は戻します。現金引出しやイベントスタッフへの支払いは、登録された区分・受取人・理由のまま表示します。勤務給与との重複を金額だけで推測したり、自動的に差し引いたりしません。" : "Positive deductions reduce your share; negative reversals restore it. Withdrawals and event-staff payments appear only as recorded categories, payees and reasons. Entries are not inferred or automatically deduplicated against wages by matching amounts."}</Note>
        <Note>{ja ? "これは支払・現金受領の証明ではありません。給与が支払済みか、現金がすでに受領されたかは、この見積もりからは判断できません。" : "This is not a payment or cash-receipt record. It does not establish which wages have been paid or which cash has already been received."}</Note>
    </Section>;
}
const Section = styled.section`display:flex; flex-direction:column; gap:var(--space-1); min-width:0; h3 {margin-top:var(--space-2);}`;
const Flow = styled.dl`margin:0; padding:var(--space-2); border-radius:10px; background:var(--neutral-800);`;
const Line = styled.div<{ $total?: boolean }>`display:flex; justify-content:space-between; gap:var(--space-2); padding:var(--space-1) 0; border-top:${({$total}) => $total ? "1px solid var(--neutral-500)" : "none"}; font-weight:${({$total}) => $total ? 700 : 400}; dt {min-width:0; overflow-wrap:anywhere;} dd {margin:0; flex-shrink:0; font-family:var(--font-family-data);}`;
const Note = styled.p`color:var(--neutral-300); font-size:var(--font-size-small); overflow-wrap:anywhere;`;
const Warning = styled.p`color:var(--warning-500);`;
const List = styled.ul`list-style:none; margin:0; padding:0;`;
const Item = styled.li`display:flex; justify-content:space-between; gap:var(--space-2); padding:var(--space-1) 0; border-bottom:1px solid var(--neutral-700); > div {min-width:0; overflow-wrap:anywhere;}`;
const Amount = styled.strong`font-family:var(--font-family-data); flex-shrink:0;`;
