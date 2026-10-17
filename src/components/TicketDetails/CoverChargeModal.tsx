import { useRef, useState, type FormEvent } from "react";
import type { Ticket } from "../../types/Ticket";
import { useModal } from "../../hooks/useModal";
import { useI18n } from "../../i18n";

export type CoverAdjustment = {
    returning_guest_count: number;
    waived_cover_count: number;
    returning_from_ticket_id: number | null;
    reason: string;
};

type Props = {
    ticket: Ticket;
    tickets: Ticket[];
    mode: "waiver" | "returning";
    onSave: (adjustment: CoverAdjustment) => Promise<boolean>;
};

/** The backend is authoritative: all guests remain counted, while only
 * uncovered, nonreturning guests are charged. No write occurs before Save. */
export default function CoverChargeModal({ ticket, tickets, mode, onSave }: Props) {
    const { locale } = useI18n();
    const { closeModal } = useModal();
    const ja = locale === "ja";
    const guests = ticket.guestCount ?? ticket.items.find(item => item.type === "cover")?.quantity ?? 0;
    const price = ticket.coverChargePerPerson ?? ticket.items.find(item => item.type === "cover")?.unit_price ?? 0;
    // Staff can waive one cover in just a few taps; existing waivers are retained.
    const [waived, setWaived] = useState(
        mode === "waiver" && !(ticket.waivedCoverCount ?? 0) && guests > 0 ? 1 : (ticket.waivedCoverCount ?? 0)
    );
    const [returning, setReturning] = useState(
        mode === "returning" && !(ticket.returningGuestCount ?? 0) && guests > (ticket.waivedCoverCount ?? 0)
            ? 1 : (ticket.returningGuestCount ?? 0)
    );
    const [sourceId, setSourceId] = useState<number | null>(ticket.returningFromTicketId ?? null);
    const [reason, setReason] = useState(
        ticket.coverAdjustmentReason ?? (mode === "waiver" ? "Complimentary cover" : "Customer returning after paid cover")
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef(false);

    // A paid cover may be reused only once, within the same shift.
    // Other ticket claims are subtracted, but backend validation is definitive
    // against concurrent adjustments on other devices.
    const sources = tickets.filter(candidate => {
        if (candidate.id === ticket.id || candidate.status !== "paid" ||
            ticket.shiftId == null || candidate.shiftId !== ticket.shiftId) return false;
        const covered = (candidate.guestCount ?? 0) -
            (candidate.returningGuestCount ?? 0) - (candidate.waivedCoverCount ?? 0);
        if (covered <= 0 || (candidate.amountPaid ?? 0) <= 0) return false;
        const claimed = tickets.filter(other => other.id !== ticket.id &&
            other.status !== "cancelled" && other.returningFromTicketId === candidate.id)
            .reduce((sum, other) => sum + (other.returningGuestCount ?? 0), 0);
        return covered > claimed;
    });
    const selectedSource = sources.find(candidate => candidate.id === sourceId);
    const availableOnSource = selectedSource
        ? (selectedSource.guestCount ?? 0) -
          (selectedSource.returningGuestCount ?? 0) - (selectedSource.waivedCoverCount ?? 0) -
          tickets.filter(other => other.id !== ticket.id && other.status !== "cancelled" &&
              other.returningFromTicketId === selectedSource.id)
              .reduce((sum, other) => sum + (other.returningGuestCount ?? 0), 0)
        : 0;
    const valid = Number.isSafeInteger(waived) && waived >= 0 &&
        Number.isSafeInteger(returning) && returning >= 0 &&
        waived + returning <= guests && Boolean(reason.trim()) &&
        reason.trim().length <= 255 &&
        (returning === 0 || (sourceId !== null && availableOnSource >= returning));
    const charged = guests - waived - returning;
    const inputChanged = (next: number, setter: (n: number) => void) => {
        setter(next);
        setError("");
    };

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!valid || pending.current || ticket.status !== "open") return;
        pending.current = true;
        setSaving(true);
        setError("");
        try {
            const saved = await onSave({
                waived_cover_count: waived,
                returning_guest_count: returning,
                returning_from_ticket_id: returning > 0 ? sourceId : null,
                reason: reason.trim(),
            });
            if (saved) closeModal();
            else setError(ja
                ? "保存を確認できませんでした。最新の伝票と既存のお支払いを確認してください。"
                : "Adjustment not confirmed. Check the latest ticket and existing payments before retrying.");
        } catch {
            setError(ja
                ? "通信結果が不明です。再操作前に伝票を確認してください。"
                : "Outcome unknown. Check the ticket before retrying.");
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }

    return <form onSubmit={event => void submit(event)}
        style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-2)" }}>
        <p>{ja
            ? "実際の来店人数は変えずに、請求するカバーチャージだけを調整します。"
            : "Adjust covers charged without changing the number of guests counted."}</p>
        <p><strong>{ja ? "来店人数" : "Guests"}: {guests}</strong> · ¥{price.toLocaleString("ja-JP")} {ja ? "／人" : "each"}</p>

        {mode === "waiver" && <label style={{ display: "grid", gap: "var(--space-1)" }}>
            {ja ? "免除する人数" : "Covers to waive"}
            <input type="number" inputMode="numeric" min={0} max={guests} step={1}
                value={waived < 0 ? "" : waived} disabled={saving}
                onChange={event => inputChanged(event.currentTarget.value === "" ? -1 : Number(event.currentTarget.value), setWaived)} />
        </label>}
        {mode === "returning" && <label style={{ display: "grid", gap: "var(--space-1)" }}>
            {ja ? "再来店人数" : "Returning guests"}
            <input type="number" inputMode="numeric" min={0} max={guests} step={1}
                value={returning < 0 ? "" : returning} disabled={saving}
                onChange={event => inputChanged(event.currentTarget.value === "" ? -1 : Number(event.currentTarget.value), setReturning)} />
        </label>}
        {mode === "returning" && returning > 0 && <label style={{ display: "grid", gap: "var(--space-1)" }}>
            {ja ? "元の支払済み伝票" : "Original paid ticket (same shift)"}
            <select required value={sourceId ?? ""} disabled={saving}
                onChange={event => { setSourceId(event.currentTarget.value ? Number(event.currentTarget.value) : null); setError(""); }}>
                <option value="">{ja ? "支払済み伝票を選択" : "Select paid ticket"}</option>
                {sources.map(candidate => <option key={candidate.id} value={candidate.id}>
                    {candidate.name} (#{candidate.id})
                </option>)}
            </select>
            {sourceId !== null && (!selectedSource || availableOnSource < returning)
                ? <small role="alert">{ja ? "指定した伝票の支払い済みカバー残数が不足しています。" : "Not enough unclaimed paid covers on that ticket."}</small>
                : null}
        </label>}
        <details>
            <summary>{ja ? "理由を変更（任意）" : "Change reason (optional)"}</summary>
            <label style={{ display: "grid", gap: "var(--space-1)" }}>
                {ja ? "記録に残る理由" : "Recorded reason"}
                <input required maxLength={255} value={reason} disabled={saving}
                    onChange={event => { setReason(event.currentTarget.value); setError(""); }} />
            </label>
        </details>
        {!valid && <p role="alert">{ja
            ? "人数・支払済み伝票・理由を確認してください。"
            : "Check the guest counts, original paid ticket, and reason."}</p>}
        <div role="status" aria-live="polite">
            <p>{ja ? "来店人数" : "Guests counted"}: <strong>{guests}</strong></p>
            <p>{ja ? "免除人数" : "Waived covers"}: <strong>{waived >= 0 ? waived : "—"}</strong></p>
            <p>{ja ? "再来店人数" : "Already covered guests"}: <strong>{returning >= 0 ? returning : "—"}</strong></p>
            <p>{ja ? "カバーチャージ請求人数" : "Covers charged"}: <strong>{charged >= 0 ? charged : "—"}</strong></p>
            <p>{ja ? "カバーチャージ合計" : "Cover total"}: <strong>{valid ? "¥" + (charged * price).toLocaleString("ja-JP") : "—"}</strong></p>
        </div>
        {error && <p role="alert">{error}</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
            <button type="button" className="hollow secondary" disabled={saving} onClick={closeModal}>
                {ja ? "キャンセル" : "Cancel"}
            </button>
            <button type="submit" disabled={!valid || saving || ticket.status !== "open"}>
                {saving ? (ja ? "保存中…" : "Saving…") : (ja ? "調整を保存" : "Save adjustment")}
            </button>
        </div>
    </form>;
}
