import { useState } from "react";
import styled from "styled-components";
import type { Account } from "../api/account";
import { localeTag, type Locale } from "../i18n";
import type { StaffActivityRow } from "./staffProfileData";
import {
    initialRateDraft, initialDrinkbackDraft, initialHoursDraft, initialBonusDraft,
    validRateDraft, validDrinkbackDraft, validHoursDraft, validBonusDraft,
    type PayBasis, type DrinkbackMode,
} from "./adminTeamDrafts";

export type AdminDrinkLine = {
    shiftId: number;
    businessDate: string;
    ticketId: number;
    name: string;
    quantity: number;
    revenue: number;
};

type EditorTab = "terms" | "time" | "drinks";
type Props = {
    person: Account;
    locale: Locale;
    rows: StaffActivityRow[];
    drinkLines: AdminDrinkLine[];
};

function dateLabel(value: string, locale: Locale) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(localeTag(locale), {
        year: "numeric", month: "short", day: "numeric",
    });
}
function hoursLabel(seconds: number) {
    return (seconds / 3600).toFixed(2) + " h";
}

/** No write requests: these editable controls are explicitly UNSAVED proposals. */
export default function AdminTeamEditors({ person, locale, rows, drinkLines }: Props) {
    const ja = locale === "ja";
    const [tab, setTab] = useState<EditorTab>("terms");
    const [rate, setRate] = useState(initialRateDraft);
    const [drinkback, setDrinkback] = useState(initialDrinkbackDraft);
    const [hours, setHours] = useState(initialHoursDraft);
    const [bonus, setBonus] = useState(initialBonusDraft);
    const correctable = rows.filter(row => row.status === "closed" && row.hoursSeconds !== null);
    const drinkShifts = [...new Set(drinkLines.map(row => row.shiftId))];
    const selectedHours = correctable.find(row => String(row.shiftId) === hours.shiftId);
    const readyRate = validRateDraft(rate);
    const readyDrinkback = validDrinkbackDraft(drinkback);
    const readyHours = validHoursDraft(hours, correctable.map(row => row.shiftId));
    const readyBonus = validBonusDraft(bonus, drinkShifts);

    return (
        <Area aria-label={ja ? person.name + " の管理" : "Manage " + person.name}>
            <Header>
                <div>
                    <h3>{ja ? "スタッフ設定・調整" : "Staff settings & adjustments"}</h3>
                    <p>{ja ? "表示中の編集内容はすべて下書きです。" : "All edits below are unsaved drafts."}</p>
                </div>
                <Pill>{ja ? "未保存プレビュー" : "PREVIEW ONLY"}</Pill>
            </Header>
            <Notice role="note">
                {ja
                    ? "現在のAPIには給与・ドリンクバック設定や修正を保存する機能がありません。入力内容は保存・送信されず、画面を離れると消えます。実際の給与にも反映されません。"
                    : "The current API cannot save pay terms, drinkback rules or corrections. Drafts are not submitted or stored and are lost when you leave this profile. No payroll or ticket amounts are changed."}
            </Notice>
            <EditorTabs role="tablist" aria-label={ja ? "スタッフ管理タブ" : "Staff management tabs"}>
                {(["terms", "time", "drinks"] as const).map(key => (
                    <button
                        key={key} type="button" role="tab"
                        className={tab === key ? "secondary" : "hollow secondary"}
                        aria-selected={tab === key}
                        onClick={() => setTab(key)}>
                        {key === "terms" ? (ja ? "給与・レート" : "Pay & rates")
                            : key === "time" ? (ja ? "勤務時間" : "Time corrections")
                                : (ja ? "ドリンク手当" : "Drink bonuses")}
                    </button>
                ))}
            </EditorTabs>

            {tab === "terms" ? (
                <Content role="tabpanel">
                    <Intro>
                        <h4>{ja ? "現在の給与設定" : "Current compensation terms"}</h4>
                        <p><strong>—</strong> {ja ? "バックエンド未対応のため未取得。0円を意味しません。" : "Not available from the current API. This does not mean ¥0."}</p>
                    </Intro>
                    <Card>
                        <h4>{ja ? "給与レートの変更案" : "Propose pay terms"}</h4>
                        <Fields>
                            <label>{ja ? "給与方式" : "Compensation type"}
                                <select value={rate.basis} onChange={e => setRate({ ...rate, basis: e.target.value as PayBasis })}>
                                    <option value="">{ja ? "選択してください" : "Select type"}</option>
                                    <option value="hourly">{ja ? "時給" : "Hourly"}</option>
                                    <option value="manager">{ja ? "マネージャー報酬（条件未設定）" : "Manager terms (not configured)"}</option>
                                    <option value="guest">{ja ? "ゲスト契約（出演ごと）" : "Guest contract (per shift)"}</option>
                                    <option value="other">{ja ? "その他（要確認）" : "Other (requires review)"}</option>
                                </select>
                            </label>
                            {rate.basis === "hourly" ? (
                                <label>{ja ? "時給（円）" : "Hourly rate (JPY)"}
                                    <input type="number" min="0" max="1000000000" step="1"
                                        value={rate.hourlyYen} placeholder="—"
                                        onChange={e => setRate({ ...rate, hourlyYen: e.target.value })} />
                                </label>
                            ) : null}
                            <label>{ja ? "適用開始日" : "Effective from"}
                                <input type="date" value={rate.effectiveFrom}
                                    onChange={e => setRate({ ...rate, effectiveFrom: e.target.value })} />
                            </label>
                            <label>{ja ? "変更理由（必須）" : "Reason (required)"}
                                <textarea rows={2} maxLength={500} value={rate.reason}
                                    onChange={e => setRate({ ...rate, reason: e.target.value })} />
                            </label>
                        </Fields>
                        {readyRate ? (
                            <Preview role="status">
                                {ja ? "変更案（未保存）" : "Proposed change (unsaved)"}: {rate.basis === "hourly" ? "¥" + Number(rate.hourlyYen).toLocaleString() + "/h" : rate.basis}
                                {" · "}{rate.effectiveFrom}
                            </Preview>
                        ) : <Help>{ja ? "給与方式・日付・理由を入力してください。時給は0以上の整数です。" : "Choose a type, date and reason. An hourly rate must be a nonnegative whole-yen amount."}</Help>}
                        <Actions>
                            <button type="button" className="hollow secondary" onClick={() => setRate(initialRateDraft)}>{ja ? "クリア" : "Clear draft"}</button>
                            <button type="button" disabled title={ja ? "保存API未対応" : "Awaiting manager-only save API"}>{ja ? "保存（未対応）" : "Save — unavailable"}</button>
                        </Actions>
                    </Card>
                    <Card>
                        <h4>{ja ? "スタッフドリンクのバック率設定案" : "Propose staff-drink bonus rule"}</h4>
                        <p>{ja ? "記録されたドリンク数から報酬額はまだ計算できません。対象条件・キャンセル・計算単位は未確定です。" : "Drink counts do not establish earned bonuses. Eligibility, refunds and calculation rules require backend approval."}</p>
                        <Fields>
                            <label>{ja ? "計算方法" : "Bonus method"}
                                <select value={drinkback.mode} onChange={e => setDrinkback({ ...drinkback, mode: e.target.value as DrinkbackMode })}>
                                    <option value="">{ja ? "選択してください" : "Select method"}</option>
                                    <option value="none">{ja ? "バックなし" : "No bonus"}</option>
                                    <option value="fixed">{ja ? "対象ドリンク1杯あたり定額（円）" : "Fixed JPY per eligible drink"}</option>
                                    <option value="percentage">{ja ? "対象ドリンク売上の割合（%）" : "Percent of eligible drink revenue"}</option>
                                </select>
                            </label>
                            {drinkback.mode === "fixed" || drinkback.mode === "percentage" ? (
                                <label>{drinkback.mode === "fixed" ? (ja ? "定額（円）" : "JPY per drink") : (ja ? "割合（%）" : "Percentage")}
                                    <input type="number" min="0" max={drinkback.mode === "percentage" ? "100" : "1000000000"}
                                        step="1" value={drinkback.amount} onChange={e => setDrinkback({ ...drinkback, amount: e.target.value })} />
                                </label>
                            ) : null}
                            <label>{ja ? "適用開始日" : "Effective from"}
                                <input type="date" value={drinkback.effectiveFrom}
                                    onChange={e => setDrinkback({ ...drinkback, effectiveFrom: e.target.value })} />
                            </label>
                            <label>{ja ? "設定理由（必須）" : "Reason (required)"}
                                <textarea rows={2} maxLength={500} value={drinkback.reason}
                                    onChange={e => setDrinkback({ ...drinkback, reason: e.target.value })} />
                            </label>
                        </Fields>
                        {readyDrinkback ? <Preview role="status">
                            {ja ? "設定案（未保存）" : "Proposed rule (unsaved)"}: {drinkback.mode === "fixed"
                                ? "¥" + Number(drinkback.amount).toLocaleString() + (ja ? "/杯" : "/drink")
                                : drinkback.mode === "percentage" ? drinkback.amount + "%" : (ja ? "バックなし" : "No bonus")}
                            {" · "}{drinkback.effectiveFrom}
                        </Preview> : <Help>{ja ? "計算方法・適用日・理由を入力してください。" : "Choose a method, effective date and reason."}</Help>}
                        <Actions>
                            <button type="button" className="hollow secondary" onClick={() => setDrinkback(initialDrinkbackDraft)}>{ja ? "クリア" : "Clear draft"}</button>
                            <button type="button" disabled title={ja ? "保存API未対応" : "Awaiting manager-only save API"}>{ja ? "保存（未対応）" : "Save — unavailable"}</button>
                        </Actions>
                    </Card>
                </Content>
            ) : null}

            {tab === "time" ? (
                <Content role="tabpanel">
                    <Intro>
                        <h4>{ja ? "勤務時間の修正案" : "Propose a work-time correction"}</h4>
                        <p>{ja
                            ? "終了済みシフトの実際に記録された勤務時間のみ参照します。過去の時刻は作成しません。"
                            : "Use only recorded duration from closed shifts. This does not fabricate clock-in or clock-out timestamps."}</p>
                    </Intro>
                    <Card>
                        <Fields>
                            <label>{ja ? "対象シフト" : "Recorded shift"}
                                <select value={hours.shiftId} onChange={e => setHours({ ...hours, shiftId: e.target.value })}>
                                    <option value="">{ja ? "シフトを選択" : "Select shift"}</option>
                                    {correctable.map(row => (
                                        <option value={row.shiftId} key={row.shiftId}>
                                            {dateLabel(row.businessDate, locale)} · {hoursLabel(row.hoursSeconds ?? 0)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>{ja ? "修正後の勤務時間（h）" : "Proposed hours worked"}
                                <input type="number" min="0" max="24" step="0.01" value={hours.correctedHours}
                                    onChange={e => setHours({ ...hours, correctedHours: e.target.value })} />
                            </label>
                            <label>{ja ? "修正理由（必須）" : "Correction reason (required)"}
                                <textarea rows={3} maxLength={500} value={hours.reason}
                                    onChange={e => setHours({ ...hours, reason: e.target.value })} />
                            </label>
                        </Fields>
                        {!correctable.length ? <Help>{ja ? "修正対象となる記録済みシフトはありません。" : "There are no recorded completed shifts to preview corrections for."}</Help> : null}
                        {selectedHours && readyHours ? (
                            <Preview role="status">
                                {ja ? "変更前" : "Recorded"}: {hoursLabel(selectedHours.hoursSeconds ?? 0)} → {ja ? "変更案（未保存）" : "Draft (unsaved)"}: {Number(hours.correctedHours).toFixed(2)} h
                            </Preview>
                        ) : null}
                        <Help>{ja ? "給与・シフト・分析データは変更されません。実際の修正には承認・監査APIが必要です。" : "No recorded hours, shift report or payroll is changed. Corrections will require an audited backend API."}</Help>
                        <Actions>
                            <button type="button" className="hollow secondary" onClick={() => setHours(initialHoursDraft)}>{ja ? "クリア" : "Clear draft"}</button>
                            <button type="button" disabled title={ja ? "修正API未対応" : "Awaiting audited correction API"}>{ja ? "修正を保存（未対応）" : "Apply correction — unavailable"}</button>
                        </Actions>
                    </Card>
                </Content>
            ) : null}

            {tab === "drinks" ? (
                <Content role="tabpanel">
                    <Intro>
                        <h4>{ja ? "記録されたスタッフドリンク" : "Recorded staff drinks"}</h4>
                        <p>{ja ? "本人IDに紐づいた記録のみ。表示額は売上であり、支払うバック金額ではありません。" : "Only drinks linked by staff ID. Revenue shown below is a recorded sale amount, NOT an earned bonus."}</p>
                    </Intro>
                    {drinkLines.length ? (
                        <Records>
                            {drinkLines.slice(0, 60).map((line, index) => (
                                <Record key={line.shiftId + ":" + line.ticketId + ":" + index}>
                                    <div>
                                        <strong>{dateLabel(line.businessDate, locale)} · {line.name} × {line.quantity}</strong>
                                        <Muted>#{line.ticketId} · {ja ? "記録された売上" : "Recorded line revenue"}: ¥{line.revenue.toLocaleString()}</Muted>
                                    </div>
                                </Record>
                            ))}
                            {drinkLines.length > 60 ? <Muted>{ja ? "最新60件を表示" : "Showing latest 60 entries"}</Muted> : null}
                        </Records>
                    ) : <Muted>{ja ? "本人IDに紐づいたドリンク記録がありません。未記録の可能性があります。" : "No drink records linked to this user ID; older records may be incomplete."}</Muted>}
                    <Card>
                        <h4>{ja ? "ドリンク手当の調整案" : "Propose a manual drink-bonus adjustment"}</h4>
                        <p>{ja ? "この調整案はスタッフドリンクの販売記録を変更しません。" : "This proposal never changes original staff-drink or ticket sales records."}</p>
                        <Fields>
                            <label>{ja ? "対象シフト" : "Shift with recorded drinks"}
                                <select value={bonus.shiftId} onChange={e => setBonus({ ...bonus, shiftId: e.target.value })}>
                                    <option value="">{ja ? "選択してください" : "Select shift"}</option>
                                    {drinkShifts.map(id => {
                                        const line = drinkLines.find(item => item.shiftId === id);
                                        return <option key={id} value={id}>{line ? dateLabel(line.businessDate, locale) : id}</option>;
                                    })}
                                </select>
                            </label>
                            <label>{ja ? "調整額（円、マイナス可）" : "Adjustment (JPY, negative allowed)"}
                                <input type="number" step="1" value={bonus.adjustmentYen}
                                    onChange={e => setBonus({ ...bonus, adjustmentYen: e.target.value })} />
                            </label>
                            <label>{ja ? "調整理由（必須）" : "Adjustment reason (required)"}
                                <textarea rows={3} maxLength={500} value={bonus.reason}
                                    onChange={e => setBonus({ ...bonus, reason: e.target.value })} />
                            </label>
                        </Fields>
                        {readyBonus ? <Preview role="status">
                            {ja ? "調整案（未保存）" : "Proposed adjustment (unsaved)"}: {Number(bonus.adjustmentYen) >= 0 ? "+" : "−"}¥{Math.abs(Number(bonus.adjustmentYen)).toLocaleString()}
                        </Preview> : <Help>{ja ? "対象シフト・0以外の整数の円金額・理由を入力してください。" : "Choose a shift, a nonzero whole-yen adjustment and a reason."}</Help>}
                        <Actions>
                            <button type="button" className="hollow secondary" onClick={() => setBonus(initialBonusDraft)}>{ja ? "クリア" : "Clear draft"}</button>
                            <button type="button" disabled title={ja ? "修正API未対応" : "Awaiting approved adjustment API"}>{ja ? "調整を保存（未対応）" : "Save adjustment — unavailable"}</button>
                        </Actions>
                    </Card>
                </Content>
            ) : null}

        </Area>
    );
}

const Area = styled.section`
    min-width: 0; display: flex; flex-direction: column; gap: var(--space-2);
    h3 { font-size: var(--font-size-h4); font-weight: 500; }
    h4 { font-size: var(--font-size-default); font-weight: 600; }
`;
const Header = styled.div`
    display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:var(--space-1);
    p { color:var(--neutral-300); }
`;
const Pill = styled.span`
    font-size:var(--font-size-small); color:var(--neutral-200); border:1px solid var(--neutral-600);
    border-radius:999px; padding:4px 10px; white-space:nowrap;
`;
const Notice = styled.p`
    padding:var(--space-2); border:1px solid var(--neutral-600); border-radius:8px;
    color:var(--neutral-300); line-height:1.5;
`;
const EditorTabs = styled.div`
    display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-1);
    @media(min-width:860px){grid-template-columns:repeat(4,minmax(0,1fr));}
    button {min-width:0; width:100%;}
`;
const Content = styled.div`display:flex; flex-direction:column; gap:var(--space-2); min-width:0;`;
const Intro = styled.div`display:flex; flex-direction:column; gap:4px; p{color:var(--neutral-300);}`;
const Card = styled.section`
    display:flex; flex-direction:column; gap:var(--space-1); min-width:0;
    padding:var(--space-2); background:var(--neutral-900); border-radius:8px;
    p {line-height:1.5}
`;
const Fields = styled.div`
    display:grid; gap:var(--space-1);
    @media(min-width:700px){grid-template-columns:repeat(2,minmax(0,1fr));}
    label{display:flex; flex-direction:column; gap:var(--space-0); min-width:0;}
    input,select,textarea{width:100%;box-sizing:border-box;background:var(--dark);}
    textarea{resize:vertical;}
`;
const Actions = styled.div`
    display:flex;gap:var(--space-1);flex-wrap:wrap;
    button{width:auto;}
    button:disabled{opacity:.55;cursor:not-allowed;}
`;
const Preview = styled.p`padding:var(--space-1);background:var(--neutral-800);border-radius:8px;`;
const Help = styled.p`color:var(--neutral-300);font-size:var(--font-size-small);`;
const Records = styled.div`display:flex;flex-direction:column;gap:var(--space-1);`;
const Record = styled.div`
    padding:var(--space-1);border-bottom:1px solid var(--neutral-700);
    strong{font-weight:500;}
`;
const Muted = styled.p`color:var(--neutral-300);overflow-wrap:anywhere;`;
