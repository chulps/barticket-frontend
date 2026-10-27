import { useState } from "react";
import { useModal } from "../../hooks/useModal";
import { useI18n } from "../../i18n";
import type { Ticket } from "../../types/Ticket";

const reasons = ["walkout", "failed_payment", "terminal_outage", "pay_later", "disputed_bill", "staff_oversight", "other"] as const;

export default function DeferPaymentModal({ ticket, onDefer }: {
    ticket: Ticket;
    onDefer: (body: { reason: string; confirmed_balance: number; note?: string; follow_up_date?: string }) => Promise<boolean>;
}) {
    const { locale } = useI18n();
    const { closeModal } = useModal();
    const ja = locale === "ja";
    const balance = ticket.balanceDue ?? Math.max(0, (ticket.serverTotal ?? ticket.items.reduce((sum, item) => sum + item.subtotal, 0)) - (ticket.amountPaid ?? 0));
    const [reason, setReason] = useState<(typeof reasons)[number]>("pay_later");
    const [confirmedBalance, setConfirmedBalance] = useState(String(balance));
    const [note, setNote] = useState("");
    const [followUpDate, setFollowUpDate] = useState("");
    const [confirmed, setConfirmed] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const amount = Number(confirmedBalance);

    async function submit() {
        if (working || !confirmed || amount !== balance || !Number.isSafeInteger(amount) || amount <= 0) return;
        setWorking(true);
        setError("");
        try {
            const saved = await onDefer({
                reason,
                confirmed_balance: amount,
                ...(note.trim() ? { note: note.trim() } : {}),
                ...(followUpDate ? { follow_up_date: followUpDate } : {}),
            });
            if (saved) closeModal();
            else setError(ja ? "未払い状態を確認できません。伝票を再読み込みして確認してください。" : "Deferral was not confirmed. Refresh the ticket and review its current state.");
        } catch {
            setError(ja ? "結果が不明です。再送信せず、伝票の状態を確認してください。" : "Outcome unknown. Do not resubmit until you refresh and verify the ticket.");
        } finally { setWorking(false); }
    }

    const reasonLabels: Record<(typeof reasons)[number], string> = {
        walkout: ja ? "支払い前に退店" : "Left without paying",
        failed_payment: ja ? "決済失敗" : "Payment failed",
        terminal_outage: ja ? "端末・通信障害" : "Terminal or network outage",
        pay_later: ja ? "後払いの合意・財布忘れ" : "Agreed to pay later / forgot wallet",
        disputed_bill: ja ? "会計内容に異議" : "Payment dispute",
        staff_oversight: ja ? "スタッフの対応漏れ" : "Staff oversight",
        other: ja ? "その他（メモ必須）" : "Other (explain in note)",
    };

    return <form onSubmit={event => { event.preventDefault(); void submit(); }} style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-2)" }}>
        <p>{ja ? "サービス提供済みの伝票を未払い残高として保存します。商品・営業日・来店人数は変更されません。" : "Save this completed service as an unpaid balance. Items, service date, and attendance stay unchanged."}</p>
        <dl style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-1)", margin: 0 }}>
            <dt>{ja ? "請求額" : "Billed"}</dt><dd>¥{(ticket.serverTotal ?? balance).toLocaleString("ja-JP")}</dd>
            <dt>{ja ? "受取済み" : "Collected"}</dt><dd>¥{(ticket.amountPaid ?? 0).toLocaleString("ja-JP")}</dd>
            <dt><strong>{ja ? "残高" : "Remaining balance"}</strong></dt><dd><strong>¥{balance.toLocaleString("ja-JP")}</strong></dd>
        </dl>
        <label>{ja ? "未払い理由" : "Reason"}
            <select value={reason} onChange={event => setReason(event.target.value as (typeof reasons)[number])} disabled={working}>
                {reasons.map(value => <option key={value} value={value}>{reasonLabels[value]}</option>)}
            </select>
        </label>
        <label>{ja ? "確認した残高（円）" : "Confirm balance (yen)"}
            <input type="number" min={1} step={1} value={confirmedBalance} onChange={event => setConfirmedBalance(event.target.value)} disabled={working} />
        </label>
        <label>{ja ? "メモ（任意。全スタッフが閲覧できます）" : "Note (optional; visible to all signed-in staff)"}
            <textarea maxLength={1000} value={note} onChange={event => setNote(event.target.value)} disabled={working} rows={3} />
        </label>
        <label>{ja ? "フォローアップ日（任意）" : "Follow-up date (optional)"}
            <input type="date" value={followUpDate} onChange={event => setFollowUpDate(event.target.value)} disabled={working} />
        </label>
        <label style={{ display: "flex", gap: "var(--space-1)", alignItems: "start" }}>
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={working} />
            <span>{ja ? "実際の残高を確認し、支払いを受け取っていないことを確認しました。" : "I verified the actual remaining balance and confirm this payment has not been collected."}</span>
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            <button type="button" className="hollow secondary" disabled={working} onClick={closeModal}>{ja ? "キャンセル" : "Cancel"}</button>
            <button type="submit" className="danger" disabled={working || !confirmed || amount !== balance || !Number.isSafeInteger(amount)}>
                {working ? (ja ? "保存中…" : "Saving…") : (ja ? "未払いとして保存" : "Mark unpaid and carry forward")}
            </button>
        </div>
    </form>;
}
