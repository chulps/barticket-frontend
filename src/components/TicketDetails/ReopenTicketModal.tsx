import { useRef, useState } from "react";
import { useModal } from "../../hooks/useModal";
import { useI18n } from "../../i18n";

type ReopenReason = "customer_returned" | "closed_by_mistake";

/** Paid tickets are reopened with an explicit reason, per backend #91.
 * "Closed by mistake" is a POS audit void, NOT a processor refund.
 * Never allow a double submit or automatically replay an ambiguous write. */
export default function ReopenTicketModal({ canCorrectPayment, onReopen }: {
    canCorrectPayment: boolean;
    onReopen: (reason: ReopenReason) => Promise<boolean>;
}) {
    const { closeModal } = useModal();
    const { locale } = useI18n();
    const ja = locale === "ja";
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef(false);

    async function reopen(reason: ReopenReason) {
        if (pending.current || (reason === "closed_by_mistake" && !canCorrectPayment)) return;
        if (reason === "closed_by_mistake" && !window.confirm(
            ja
                ? "これは決済端末の返金ではありません。POSの支払い記録を取消します。続けますか？"
                : "This voids the POS payment record, but DOES NOT refund the customer's card. Continue?"
        )) return;
        pending.current = true;
        setSaving(true);
        setError("");
        try {
            if (await onReopen(reason)) closeModal();
            else setError(ja
                ? "伝票を再開できませんでした。伝票と支払い記録を確認してください。"
                : "Reopen not confirmed. Check the ticket and its payments before trying again.");
        } catch {
            setError(ja
                ? "通信結果が不明です。再試行前に伝票をご確認ください。"
                : "Outcome unknown. Check the ticket before retrying.");
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }

    return <div style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-2)" }}>
        <p>{ja ? "再開する理由を選んでください。" : "Why are you reopening the paid ticket?"}</p>
        <button type="button" disabled={saving} onClick={() => void reopen("customer_returned")}>
            {ja ? "お客様が再来店" : "Customer returned"}
        </button>
        <p>{ja
            ? "以前のお支払いを保持します。新たに追加した商品の残額だけを会計します。"
            : "Keep previous payments. Collect only the balance for new orders."}</p>
        {canCorrectPayment && <>
            <button type="button" className="hollow danger" disabled={saving}
                onClick={() => void reopen("closed_by_mistake")}>
                {ja ? "誤って会計済みにした" : "Closed by mistake — manager correction"}
            </button>
            <p>{ja
                ? "POSの支払いを監査記録付きで取り消します。カード決済の返金は別途必要です。"
                : "Audit-void the recorded POS payment. This does NOT process a card refund."}</p>
        </>}
        {error && <p role="alert">{error}</p>}
        <button type="button" className="hollow secondary" disabled={saving} onClick={closeModal}>
            {ja ? "キャンセル" : "Cancel"}
        </button>
    </div>;
}
