import { useRef, useState, type FormEvent } from "react";
import type { Ticket } from "../../types/Ticket";
import { useModal } from "../../hooks/useModal";
import { useI18n } from "../../i18n";

/** Existing API contract is PATCH /tickets/:id/cover-waivers (#92).
 * Returning-customer links are intentionally unavailable until their backend
 * validation and payment-history API exists. */
export default function CoverChargeModal({ ticket, onSave }: {
    ticket: Ticket; onSave: (count: number) => Promise<boolean>;
}) {
    const { locale } = useI18n();
    const { closeModal } = useModal();
    const ja = locale === "ja";
    const guests = ticket.guestCount ?? ticket.items.find(item => item.type === "cover")?.quantity ?? 0;
    const price = ticket.coverChargePerPerson ?? ticket.items.find(item => item.type === "cover")?.unit_price ?? 0;
    const [waived, setWaived] = useState(ticket.waivedCoverCount ?? 0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef(false);
    const valid = Number.isSafeInteger(waived) && waived >= 0 && waived <= guests;
    const charged = guests - waived;

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!valid || busy || pending.current || ticket.status !== "open") return;
        pending.current = true;
        setBusy(true);
        setError("");
        try {
            if (await onSave(waived)) closeModal();
            else setError(ja ? "保存を確認できませんでした。最新の伝票を確認してください。" : "Could not confirm waiver. Check the current ticket before trying again.");
        } catch {
            setError(ja ? "結果が不明です。再操作する前に伝票を確認してください。" : "Outcome unknown. Check the ticket before retrying.");
        } finally {
            pending.current = false;
            setBusy(false);
        }
    }

    return <form onSubmit={event => void submit(event)}
        style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-2)" }}>
        <p>{ja ? "カバーチャージを免除しても、来店人数は変わりません。" : "Waiving a cover does not remove the guest from attendance."}</p>
        <p><strong>{ja ? "来店人数" : "Guests"}: {guests}</strong> · ¥{price.toLocaleString("ja-JP")} {ja ? "／人" : "each"}</p>
        <label style={{ display: "grid", gap: "var(--space-1)" }}>
            {ja ? "免除するカバーチャージの人数" : "Number of cover charges to waive"}
            <input type="number" inputMode="numeric" min={0} max={guests} step={1}
                value={waived < 0 ? "" : waived} disabled={busy}
                onChange={event => {
                    const raw = event.currentTarget.value;
                    setWaived(raw === "" ? -1 : Number(raw));
                }} />
        </label>
        {!valid ? <p role="alert">{ja ? "0から来店人数までの整数を入力してください。" : "Enter a whole number from zero to the guest count."}</p> : null}
        <div role="status" aria-live="polite">
            <p>{ja ? "来店人数" : "Guests counted"}: <strong>{guests}</strong></p>
            <p>{ja ? "免除人数" : "Waived covers"}: <strong>{valid ? waived : "—"}</strong></p>
            <p>{ja ? "請求対象人数" : "Covers charged"}: <strong>{valid ? charged : "—"}</strong></p>
            <p>{ja ? "カバーチャージ合計" : "Cover total"}: <strong>{valid ? "¥" + (charged * price).toLocaleString("ja-JP") : "—"}</strong></p>
        </div>
        <p style={{color: "var(--neutral-300)"}}>{ja
            ? "再来店客のチケット紐付けと支払履歴は追加バックエンドAPI待ちです。"
            : "Returning-customer linking and payment history are pending additional backend support."}</p>
        {error ? <p role="alert">{error}</p> : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            <button type="button" className="hollow secondary" disabled={busy} onClick={closeModal}>{ja ? "キャンセル" : "Cancel"}</button>
            <button type="submit" disabled={!valid || busy || ticket.status !== "open"}>
                {busy ? (ja ? "保存中…" : "Saving…") : (ja ? "免除を保存" : "Save cover waiver")}
            </button>
        </div>
    </form>;
}
