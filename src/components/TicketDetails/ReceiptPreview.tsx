import { useRef, useState } from "react";
import type { Ticket } from "../../types/Ticket";
import { localeTag, useI18n } from "../../i18n";
import { useModal } from "../../hooks/useModal";
import { ApiError } from "../../api/client";
import { ticketsApi } from "../../api/tickets";
import { receiptPreviewText, validReceiptEmail } from "./receiptEmailUtils";

const panelStyle = {
    display: "flex", flexDirection: "column", gap: "var(--space-2)",
    padding: "var(--space-2)", minWidth: 0,
} as const;

export default function ReceiptPreview({ ticket }: { ticket: Ticket }) {
    const { locale } = useI18n();
    const { closeModal } = useModal();
    const ja = locale === "ja";
    const [email, setEmail] = useState("");
    const [touched, setTouched] = useState(false);
    const [notice, setNotice] = useState("");
    const [sending, setSending] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [outcomeUnknown, setOutcomeUnknown] = useState(false);
    const sendKey = useRef<string | null>(null);
    const valid = validReceiptEmail(email);
    const total = ticket.serverTotal ?? ticket.items.reduce((sum, item) => sum + item.subtotal, 0);

    async function sendReceipt() {
        if (!valid || sending || accepted || outcomeUnknown) return;
        sendKey.current ??= crypto.randomUUID();
        setSending(true);
        setNotice("");
        try {
            await ticketsApi.emailReceipt(ticket.id, email.trim(), locale, sendKey.current);
            setAccepted(true);
            setNotice(ja
                ? "メール送信を受け付けました。受信トレイへの配信を保証するものではありません。"
                : "The email provider accepted the receipt request. This does not guarantee inbox delivery.");
        } catch (error) {
            const code = error instanceof ApiError && error.detail && typeof error.detail === "object" && "code" in error.detail
                ? error.detail.code : undefined;
            if (code === "EMAIL_STATUS_UNKNOWN" || !(error instanceof ApiError)) {
                setOutcomeUnknown(true);
                setNotice(ja
                    ? "送信結果を確認できません。重複送信を防ぐため再送できません。管理者に確認してください。"
                    : "The send result is unknown. To avoid a duplicate, this form cannot retry. Please check with a manager.");
            } else {
                setNotice(error.message || (ja ? "メールを送信できませんでした。" : "Could not send the receipt."));
            }
        } finally {
            setSending(false);
        }
    }

    async function copyReceipt() {
        try {
            // Do not include the customer's typed email in clipboard output.
            await navigator.clipboard.writeText(receiptPreviewText(ticket, locale));
            setNotice(ja ? "プレビューをコピーしました。メールは送信されていません。" :
                "Receipt preview copied. No email was sent.");
        } catch {
            setNotice(ja ? "コピーできませんでした。" : "Could not copy the preview.");
        }
    }

    return <div style={panelStyle}>
        <p>{ja
            ? "メールアドレスはこの送信要求の処理中のみ使用され、アプリには保存されません。"
            : "The recipient address is used to process this request and is not stored by BarTicket."}</p>
        <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {ja ? "送信先メールアドレス" : "Recipient email"}
            <input type="email" autoComplete="email" inputMode="email"
                maxLength={254} value={email} placeholder="customer@example.com"
                aria-invalid={touched && !valid}
                onBlur={() => setTouched(true)}
                onChange={event => { setEmail(event.target.value); setNotice(""); }} />
        </label>
        {touched && email && !valid ? <p role="alert">{ja
            ? "正しいメールアドレスを入力してください。" : "Enter a valid email address."}</p> : null}
        <section aria-label={ja ? "領収明細プレビュー" : "Receipt preview"}
            style={{ padding: "var(--space-2)", border: "1px solid var(--neutral-600)",
                borderRadius: 8, display: "grid", gap: "var(--space-1)" }}>
            <h3>ROCK BAR FXXK UP</h3>
            <p>{ja ? "札幌 · 領収明細" : "Sapporo · Receipt"}</p>
            <p>#{ticket.id} · {ticket.payment
                ? new Date(ticket.payment.paid_at * 1000).toLocaleString(localeTag(locale), {
                    timeZone: "Asia/Tokyo", year: "numeric", month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                }) + " JST"
                : (ja ? "支払日時未確認" : "Payment time not verified")}</p>
            <p>{ja ? "決済方法" : "Payment method"}: {ticket.payment?.type ?? (ja ? "不明" : "Unknown")}</p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {ticket.items.map((item, index) =>
                    <li key={item.id + ":" + index} style={{
                        display: "flex", justifyContent: "space-between", gap: "var(--space-2)",
                        borderBottom: "1px solid var(--neutral-700)", padding: "var(--space-1) 0",
                    }}>
                        <span>{item.name} × {item.quantity}</span>
                        <strong>¥{item.subtotal.toLocaleString("ja-JP")}</strong>
                    </li>)}
            </ul>
            <p style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
                <strong>{ja ? "合計" : "Total"}</strong>
                <strong>¥{total.toLocaleString("ja-JP")}</strong>
            </p>
            <small>{ja
                ? "記録された決済合計" : "Recorded payments"}: ¥{(ticket.amountPaid ?? ticket.payments?.filter(payment => !payment.voided_at).reduce((sum, payment) => sum + payment.amount, 0) ?? ticket.payment?.amount ?? 0).toLocaleString("ja-JP")}</small>
        </section>
        {notice ? <p role="status">{notice}</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            <button type="button" className="hollow secondary" onClick={closeModal}>{ja ? "閉じる" : "Close"}</button>
            <button type="button" className="secondary" onClick={() => void copyReceipt()}>
                {ja ? "領収明細をコピー" : "Copy receipt"}
            </button>
            <button type="button" disabled={!valid || sending || accepted || outcomeUnknown} onClick={() => void sendReceipt()}>
                {accepted ? (ja ? "送信受付済み" : "Request accepted") : sending ? (ja ? "送信中…" : "Sending…") : (ja ? "メールで送信" : "Send email")}
            </button>
        </div>
    </div>;
}
