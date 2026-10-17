import { useState } from "react";
import type { Ticket } from "../../types/Ticket";
import { localeTag, useI18n } from "../../i18n";
import { useModal } from "../../hooks/useModal";

const panelStyle = {
    display: "flex", flexDirection: "column", gap: "var(--space-2)",
    padding: "var(--space-2)", minWidth: 0,
} as const;

export function validReceiptEmail(value: string): boolean {
    const email = value.trim();
    return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function receiptPreviewText(ticket: Ticket, locale: "en" | "ja"): string {
    const ja = locale === "ja";
    const total = ticket.items.reduce((sum, line) => sum + line.subtotal, 0);
    const paidAt = ticket.payment?.paid_at
        ? new Date(ticket.payment.paid_at * 1000).toLocaleString(localeTag(locale), {
            timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit",
            day: "2-digit", hour: "2-digit", minute: "2-digit",
        }) + " JST" : (ja ? "未確認" : "Not verified");
    const items = ticket.items.map(line =>
        line.name + " × " + line.quantity + " — ¥" + line.subtotal.toLocaleString("ja-JP")
    ).join("\n");
    return [
        "ROCK BAR FXXK UP — SAPPORO",
        ja ? "領収明細プレビュー（未送信）" : "Receipt preview (not sent)",
        "Ticket #" + ticket.id,
        (ja ? "会計日時" : "Paid at") + ": " + paidAt,
        (ja ? "決済方法" : "Payment method") + ": " + (ticket.payment?.type ?? (ja ? "不明" : "Unknown")),
        "", items, "",
        (ja ? "明細合計（参考）" : "Recorded line total (reference)") + ": ¥" + total.toLocaleString("ja-JP"),
        ja ? "正式な決済金額と領収書はバックエンドの送信API提供後に確定します。" :
            "Authoritative paid totals and delivery require the backend receipt API.",
    ].join("\n");
}

export default function ReceiptPreview({ ticket }: { ticket: Ticket }) {
    const { locale } = useI18n();
    const { closeModal } = useModal();
    const ja = locale === "ja";
    const [email, setEmail] = useState("");
    const [touched, setTouched] = useState(false);
    const [notice, setNotice] = useState("");
    const valid = validReceiptEmail(email);
    const total = ticket.items.reduce((sum, item) => sum + item.subtotal, 0);

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
        <p role="status">{ja
            ? "メール送信はまだ利用できません（バックエンド #77 対応待ち）。メールアドレスは保存・送信されません。"
            : "Email delivery is not available yet (backend #77). Recipient addresses are not saved or sent."}</p>
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
            <p>{ja ? "札幌 · 明細プレビュー（未送信）" : "Sapporo · Receipt preview (not sent)"}</p>
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
                <strong>{ja ? "明細合計（参考）" : "Recorded line total (reference)"}</strong>
                <strong>¥{total.toLocaleString("ja-JP")}</strong>
            </p>
            <small>{ja
                ? "正式な領収書・決済済み金額・配信履歴はバックエンド対応後に利用できます。"
                : "Official receipt, authoritative paid total and delivery history require backend support."}</small>
        </section>
        {notice ? <p role="status">{notice}</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            <button type="button" className="hollow secondary" onClick={closeModal}>{ja ? "閉じる" : "Close"}</button>
            <button type="button" className="secondary" onClick={() => void copyReceipt()}>
                {ja ? "プレビューをコピー" : "Copy preview"}
            </button>
            <button type="button" disabled title={ja ? "メール送信API対応待ち" : "Awaiting email delivery API"}>
                {ja ? "メール送信（未対応）" : "Send email — unavailable"}
            </button>
        </div>
    </div>;
}
