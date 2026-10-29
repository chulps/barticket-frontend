import { useCallback, useEffect, useState, type FormEvent } from "react";
import { accountApi, type Account, type ManagerPayDeduction } from "../api/account";
import RequestState from "../components/RequestState";
import styled from "styled-components";

type Props = { managers: Account[]; locale: string };

function categoryLabel(category: ManagerPayDeduction["category"], ja: boolean) {
    switch (category) {
        case "language_exchange_commission": return ja ? "Language Exchange 手数料" : "Language Exchange commission";
        case "manager_paid_staff_tip": return ja ? "スタッフへのチップ" : "Manager-paid staff tip";
        case "manager_pay_deduction": return ja ? "確認済みのマネージャー報酬控除" : "Confirmed manager-pay deduction";
    }
}

function monthRange(month: string) {
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return { date_from: `${month}-01`, date_to: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function currentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminPayDeductions({ managers, locale }: Props) {
    const ja = locale === "ja";
    const [month, setMonth] = useState(currentMonth);
    const [beneficiary, setBeneficiary] = useState("");
    const [items, setItems] = useState<ManagerPayDeduction[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [category, setCategory] = useState<ManagerPayDeduction["category"]>("language_exchange_commission");
    const [amount, setAmount] = useState("");
    const [businessDate, setBusinessDate] = useState(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`; });
    const [payeeName, setPayeeName] = useState("");
    const [reason, setReason] = useState("");
    const [sourceFile, setSourceFile] = useState("");
    const [sourceRow, setSourceRow] = useState("");
    const [sourceColumn, setSourceColumn] = useState("");
    const [sourceNote, setSourceNote] = useState("");

    useEffect(() => {
        if (!beneficiary && managers.length) setBeneficiary(String(managers[0].id));
    }, [beneficiary, managers]);

    const refresh = useCallback(async () => {
        if (!beneficiary) { setItems([]); setTotal(0); return; }
        setLoading(true);
        setError("");
        try {
            const period = monthRange(month);
            const response = await accountApi.managerPayDeductions({ ...period, beneficiary_user_id: Number(beneficiary) });
            setItems(response.items);
            setTotal(response.signed_deduction_total_yen);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setLoading(false);
        }
    }, [beneficiary, month]);

    useEffect(() => { void refresh(); }, [refresh]);

    async function create(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await accountApi.createManagerPayDeduction({
                beneficiary_user_id: Number(beneficiary),
                category,
                amount_yen: Number(amount),
                business_date: businessDate,
                payee_name: payeeName.trim(),
                reason: reason.trim(),
                ...(sourceFile.trim() ? { source_file: sourceFile.trim() } : {}),
                ...(sourceRow ? { source_row: Number(sourceRow) } : {}),
                ...(sourceColumn.trim() ? { source_column: sourceColumn.trim() } : {}),
                ...(sourceNote.trim() ? { source_note: sourceNote.trim() } : {}),
            });
            setNotice(ja ? "記録しました。" : "Deduction recorded.");
            setAmount("");
            setReason("");
            setSourceRow("");
            setSourceNote("");
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    async function reverse(item: ManagerPayDeduction) {
        const explanation = window.prompt(ja ? "取り消す理由を入力してください。" : "Enter a reason for this correction.");
        if (!explanation?.trim()) return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await accountApi.reverseManagerPayDeduction(item.id, explanation.trim());
            setNotice(ja ? "訂正記録を追加しました。" : "Audited reversal added.");
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    }

    const dateError = !/^\d{4}-\d{2}$/.test(month);
    return (
        <div>
            <Panel>
                <h2>{ja ? "マネージャー報酬の控除" : "Manager pay deductions"}</h2>
                <p>{ja
                    ? "売上や支払記録とは別の記録です。確定した対象のみ登録し、訂正は理由付きで追加します。"
                    : "These records stay separate from sales and payments. Confirmed categories are available; corrections are appended with a reason."}</p>
                {managers.length === 0 ? <p role="status">{ja ? "マネージャーアカウントがありません。" : "No manager accounts are available."}</p> : (
                    <label>
                        {ja ? "報酬の対象者" : "Manager"}
                        <select value={beneficiary} onChange={event => setBeneficiary(event.target.value)}>
                            {managers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
                        </select>
                    </label>
                )}
                <label>
                    {ja ? "表示する月" : "Month"}
                    <input type="month" value={month} onChange={event => setMonth(event.target.value)} />
                </label>
                {dateError ? <p role="alert">{ja ? "年月を選択してください。" : "Choose a valid month."}</p> : null}
                {error ? <p role="alert">{error}</p> : null}
                {notice ? <p role="status">{notice}</p> : null}
                <p><strong>{ja ? "控除合計" : "Net deductions"}: ¥{total.toLocaleString()}</strong></p>
            </Panel>

            <Panel>
                <h2>{ja ? "控除を記録" : "Record a deduction"}</h2>
                <form onSubmit={create}>
                    <label>{ja ? "種類" : "Type"}
                        <select value={category} onChange={event => setCategory(event.target.value as ManagerPayDeduction["category"])}>
                            <option value="language_exchange_commission">{ja ? "Language Exchange 手数料" : "Language Exchange commission"}</option>
                            <option value="manager_paid_staff_tip">{ja ? "スタッフへのマネージャー立替チップ" : "Manager-paid staff tip"}</option>
                            <option value="manager_pay_deduction">{ja ? "確認済みのマネージャー報酬控除" : "Confirmed manager-pay deduction"}</option>
                        </select>
                    </label>
                    {category === "manager_pay_deduction" ? <p>{ja
                        ? "マネージャーが報酬から差し引くことを確認した金額に使用します。出典に詳しい種類がない場合は、元の列名と出典を記録してください。"
                        : "Use only when a manager confirms the amount reduces pay. Preserve the original source column when it does not give a more specific type."}</p> : null}
                    <label>{ja ? "金額（円）" : "Amount (JPY)"}
                        <input type="number" min="1" max="10000000" step="1" required value={amount} onChange={event => setAmount(event.target.value)} />
                    </label>
                    <label>{ja ? "営業日" : "Business date"}
                        <input type="date" required value={businessDate} onChange={event => setBusinessDate(event.target.value)} />
                    </label>
                    <label>{ja ? "支払先" : "Payee"}
                        <input required maxLength={255} value={payeeName} onChange={event => setPayeeName(event.target.value)} />
                    </label>
                    <label>{ja ? "理由・説明" : "Reason"}
                        <textarea required maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
                    </label>
                    <details open={category === "manager_pay_deduction"}>
                        <summary>{ja ? (category === "manager_pay_deduction" ? "出典（必須）" : "出典（任意）") : (category === "manager_pay_deduction" ? "Source details (required)" : "Source details (optional)")}</summary>
                        <label>{ja ? "ファイル名" : "Spreadsheet/file"}<input maxLength={512} required={category === "manager_pay_deduction"} value={sourceFile} onChange={event => setSourceFile(event.target.value)} /></label>
                        <label>{ja ? "行番号" : "Row number"}<input type="number" min="1" step="1" required={category === "manager_pay_deduction"} value={sourceRow} onChange={event => setSourceRow(event.target.value)} /></label>
                        <label>{ja ? "列名" : "Column"}<input maxLength={128} required={category === "manager_pay_deduction"} value={sourceColumn} onChange={event => setSourceColumn(event.target.value)} /></label>
                        <label>{ja ? "出典メモ" : "Source note"}<textarea maxLength={1000} value={sourceNote} onChange={event => setSourceNote(event.target.value)} /></label>
                    </details>
                    <button type="submit" disabled={busy || !beneficiary || dateError}>{ja ? "控除を保存" : "Save deduction"}</button>
                </form>
            </Panel>

            <Panel>
                <h2>{ja ? "記録" : "Entries"}</h2>
                {loading ? <RequestState kind="loading" detail={ja ? "読み込み中" : "Loading"} /> : items.length === 0
                    ? <p>{ja ? "この月の記録はありません。" : "No entries for this month."}</p>
                    : <ul>
                        {items.map(item => (
                            <li key={item.id}>
                                <strong>{item.business_date} · ¥{item.signed_amount_yen.toLocaleString()}</strong>
                                <span> · {categoryLabel(item.category, ja)} · {item.payee_name} · {item.reason}</span>
                                {item.reversal_of_id ? <span> · {ja ? "訂正" : "reversal"}</span> : null}
                                {!item.reversal_of_id && !items.some(other => other.reversal_of_id === item.id)
                                    ? <button type="button" className="small secondary" disabled={busy} onClick={() => void reverse(item)}>{ja ? "理由を付けて訂正" : "Correct with reason"}</button>
                                    : null}
                                {item.source.file ? <small>{item.source.file}{item.source.row ? ` · row ${item.source.row}` : ""}{item.source.column ? ` · ${item.source.column}` : ""}</small> : null}
                            </li>
                        ))}
                    </ul>}
            </Panel>
        </div>
    );
}

const Panel = styled.section`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-2);
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;
    form { display: flex; flex-direction: column; gap: var(--space-1); }
    label { display: flex; flex-direction: column; gap: var(--space-0); }
    input, select, textarea { width: 100%; box-sizing: border-box; }
    input:focus, select:focus, textarea:focus { transform: none; }
    select, textarea { background: var(--dark); }
    li { margin-bottom: var(--space-1); }
    small { display: block; color: var(--neutral-300); }
`;
