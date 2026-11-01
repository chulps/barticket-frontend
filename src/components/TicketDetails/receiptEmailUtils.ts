import { paymentMethodLabel } from "../paymentMethods";
import type { Ticket } from "../../types/Ticket";
import { localeTag } from "../../i18n";

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
        (ja ? "決済方法" : "Payment method") + ": " + (ticket.payment ? paymentMethodLabel(ticket.payment.type, locale) : (ja ? "不明" : "Unknown")),
        "", items, "",
        (ja ? "明細合計（参考）" : "Recorded line total (reference)") + ": ¥" + total.toLocaleString("ja-JP"),
        ja ? "正式な決済金額と領収書はバックエンドの送信API提供後に確定します。" :
            "Authoritative paid totals and delivery require the backend receipt API.",
    ].join("\n");
}
