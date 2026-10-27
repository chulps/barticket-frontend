import { useState } from "react";
import styled from "styled-components";
import type { ShiftReport, Account } from "../api/account";

export function StaffDetails({ people, shifts, locale }: { people: Account[]; shifts: ShiftReport[]; locale: string }) {
    const ja = locale === "ja";
    const [personId, setPersonId] = useState<number | null>(null);
    const [search, setSearch] = useState("");
    const [role, setRole] = useState("all");
    const isGuest = (name: string) => ["Yuchan", "Mii-chan"].includes(name);
    const person = people.find(p => p.id === personId);
    const punches = shifts.flatMap(shift => shift.staff_hours.filter(row => row.user_id === personId).map(row => ({ shift, hours: row.seconds / 3600 })));
    const drinks = shifts.flatMap(shift => (shift.staff_drinks ?? []).filter(row => row.staff_id === personId).map(row => ({ shift, row })));
    return <Panel>
        <h2>{ja ? "スタッフディレクトリ" : "Staff directory"}</h2>
        <p>{ja ? "現在有効なアカウントと、APIで確認できる勤務記録のみ表示します。" : "Active accounts and recorded shift activity only. Historical staffing data may be incomplete."}</p>
        <Controls><input aria-label={ja ? "スタッフを検索" : "Search staff"} placeholder={ja ? "名前・メールで検索" : "Search name or email"} value={search} onChange={e => setSearch(e.target.value)} />
        <Select><select aria-label={ja ? "役割で絞り込む" : "Filter role"} value={role} onChange={e => setRole(e.target.value)}><option value="all">{ja ? "すべて" : "All roles"}</option><option value="staff">{ja ? "スタッフ" : "Staff"}</option><option value="manager">{ja ? "マネージャー" : "Manager"}</option><option value="guest">{ja ? "ゲスト" : "Guest bartenders"}</option></select><i aria-hidden="true">▾</i></Select></Controls>
        <Directory>{people.filter(p => (role === "all" || (role === "guest" ? isGuest(p.name) : p.role === role && (role !== "staff" || !isGuest(p.name)))) && (p.name + " " + p.email).toLowerCase().includes(search.toLowerCase())).map(p =>
            <button key={p.id} type="button" className={p.id === personId ? "secondary" : "hollow secondary"} onClick={() => setPersonId(p.id)}>
                <strong>{p.name}</strong><small>{isGuest(p.name) ? (ja ? "ゲスト（都度契約）" : "Guest · per-shift agreement") : p.role} · {p.email}</small>
            </button>)}</Directory>
        {person ? <Detail>
            <h3>{person.name}</h3>
            <p>{person.email} · {isGuest(person.name) ? (ja ? "ゲストバーテンダー" : "Guest bartender") : person.role}</p>
            {isGuest(person.name) ? <p>{ja ? "契約・時給・ドリンクバックは出演ごとに異なります。ここでは給与を推測しません。" : "Contract, hourly pay and drinkback vary by appearance. No default guest compensation is assumed."}</p> : null}
            <Stats><div><span>{ja ? "勤務記録のあるシフト" : "Recorded shifts"}</span><strong>{punches.length || "—"}</strong></div>
                <div><span>{ja ? "打刻記録の勤務時間" : "Hours from punches"}</span><strong>{punches.length ? punches.reduce((sum,p) => sum + p.hours,0).toFixed(1) + "h" : "—"}</strong></div>
                <div><span>{ja ? "スタッフドリンク" : "Staff drinks"}</span><strong>{drinks.reduce((sum,p) => sum + p.row.quantity,0)}</strong></div></Stats>
            <h4>{ja ? "記録された勤務履歴" : "Recorded shift activity"}</h4>
            {punches.length ? punches.sort((a,b) => b.shift.business_date.localeCompare(a.shift.business_date)).slice(0,30).map(({shift,hours}) =>
                <History key={shift.id}><time>{shift.business_date}</time><span>{hours.toFixed(1)} h</span></History>) :
                <p>{ja ? "勤務打刻がありません。これは実際に働いていないという意味ではありません。" : "No punch-based hours recorded. This does not mean the employee did not work."}</p>}
            <p>{ja ? "時給・賞与・個人情報の編集には管理用APIが必要です。" : "Editing pay rates, bonuses and employee details requires manager-only backend APIs."}</p>
        </Detail> : <p>{ja ? "スタッフを選択してください。" : "Select an account to view details."}</p>}
    </Panel>;
}

export function PayrollPlanner({ locale }: { locale: string }) {
    const ja = locale === "ja";
    const [hours,setHours] = useState("");
    const [rate,setRate] = useState("");
    const [bonus,setBonus] = useState("");
    const [deduction,setDeduction] = useState("");
    const nums=[hours,rate,bonus,deduction];
    const valid=nums.every(v => !v || (/^\d+(\.\d+)?$/.test(v) && Number.isFinite(Number(v)) && Number(v)>=0));
    const total=Number(hours||0)*Number(rate||0)+Number(bonus||0)-Number(deduction||0);
    return <Panel><h2>{ja ? "給与・控除" : "Payroll & deductions"}</h2>
        <p><strong>{ja ? "計算プレビューのみ（未保存）" : "Calculation preview only — not saved"}</strong></p>
        <p>{ja ? "参考用の計算機です。時給・勤務時間・控除はDBに保存されません。源泉徴収や支払処理には使用しないでください。" : "Use this for estimates only. No hours, rates or adjustments are saved. This is not a payroll ledger or payment instruction."}</p>
        <Controls>{[[hours,setHours,ja?"合計勤務時間":"Hours worked"],[rate,setRate,ja?"時給 (円)":"Hourly rate (JPY)"],[bonus,setBonus,ja?"追加支給 (円)":"Bonus/reimbursement (JPY)"],[deduction,setDeduction,ja?"控除 (円)":"Deductions (JPY)"]].map(([value,set,label])=>
            <label key={label as string}>{label as string}<input type="number" min="0" step="any" value={value as string} onChange={e => (set as (v:string)=>void)(e.target.value)} /></label>)}</Controls>
        {!valid ? <p role="alert">{ja ? "0以上の数値を入力してください。" : "Enter valid nonnegative amounts."}</p> : <p><strong>{ja ? "概算額" : "Estimated total"}: ¥{total.toLocaleString("ja-JP",{maximumFractionDigits:0})}</strong></p>}
        <p>{ja ? "スタッフ別時給履歴、マネージャー報酬、立替・前払い、監査ログはバックエンド対応待ちです。" : "Staff rate history, manager compensation, advances, expenses and audited deductions require backend support."}</p>
    </Panel>;
}
export function AdminSettings({locale}: {locale:string}) {
    const ja=locale==="ja";
    return <Panel><h2>{ja?"システム設定":"System settings"}</h2>
        <p><strong>{ja?"現在は読み取り専用":"Read-only — backend pending"}</strong></p>
        <p>{ja?"全体設定を保存するAPIがまだありません。":"Shared settings cannot be changed until configuration APIs are available."}</p>
        <History><span>{ja?"管理権限":"Access"}</span><strong>{ja?"マネージャーのみ":"Managers only"}</strong></History>
        <History><span>{ja?"言語":"Language"}</span><strong>{locale.toUpperCase()}</strong></History>
        <p>{ja?"言語はナビゲーションの切替ボタンから変更できます。カバー料金、時給、報酬ルールの編集は後で追加します。":"Use the navigation switcher for your language. Cover charge, hourly rates and compensation rules will be configurable after backend support."}</p>
    </Panel>;
}
const Panel=styled.section`display:flex;flex-direction:column;gap:var(--space-1);padding:var(--space-2);background:var(--neutral-900);border-radius:12px;min-width:0;h2{font-size:var(--font-size-h4)}`;
const Controls=styled.div`display:grid;grid-template-columns:minmax(0,1fr);gap:var(--space-1);@media(min-width:680px){grid-template-columns:repeat(2,minmax(0,1fr))}label{display:flex;flex-direction:column;gap:var(--space-0)}input,select{width:100%;box-sizing:border-box}`;
const Select=styled.div`position:relative;select{appearance:none;background:var(--dark);padding-right:2.5em}i{position:absolute;right:1em;top:50%;transform:translateY(-50%);font-style:normal;pointer-events:none}`;
const Directory=styled.div`display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:var(--space-1);@media(min-width:680px){grid-template-columns:repeat(2,minmax(0,1fr))}button{text-align:left;display:flex;flex-direction:column;gap:3px;min-width:0;small{overflow-wrap:anywhere}}`;
const Detail=styled.div`padding:var(--space-2);background:var(--neutral-800);border-radius:8px;display:flex;flex-direction:column;gap:var(--space-1)`;
const Stats=styled.div`display:grid;grid-template-columns:repeat(1,minmax(0,1fr));gap:var(--space-1);@media(min-width:680px){grid-template-columns:repeat(3,minmax(0,1fr))}div{display:flex;flex-direction:column;gap:4px}span{color:var(--neutral-300)}strong{font-size:var(--font-size-h4)}`;
const History=styled.div`display:flex;justify-content:space-between;gap:var(--space-1);border-bottom:1px solid var(--neutral-700);padding:var(--space-1) 0`;
