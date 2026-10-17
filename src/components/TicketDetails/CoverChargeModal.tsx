import { useRef, useState, type FormEvent } from "react";
import styled from "styled-components";
import type { Ticket } from "../../types/Ticket";
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
    mode: "returning" | "waiver";
    onCancel: () => void;
    onSave: (value: CoverAdjustment) => Promise<boolean>;
};

export default function CoverChargeModal({ ticket, tickets, mode, onCancel, onSave }: Props) {
    const { locale } = useI18n();
    const ja = locale === "ja";
    const guestCount = ticket.guestCount ?? ticket.items.find(item => item.type === "cover")?.quantity ?? 0;
    const coverPrice = ticket.coverChargePerPerson ?? ticket.items.find(item => item.type === "cover")?.unit_price ?? 0;
    const [returning, setReturning] = useState(
        ticket.returningGuestCount || (mode === "returning" ? Math.min(1, guestCount) : 0),
    );
    const [waived, setWaived] = useState(
        ticket.waivedCoverCount || (mode === "waiver" ? Math.min(1, guestCount) : 0),
    );
    const [sourceId, setSourceId] = useState<number | null>(ticket.returningFromTicketId ?? null);
    const [reason, setReason] = useState(ticket.coverAdjustmentReason ||
        (mode === "waiver" ? "Complimentary cover" : "Returning guest — cover already paid"));
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const locked = useRef(false);
    const candidates = tickets.filter(row => row.id !== ticket.id && row.shiftId !== null &&
        row.shiftId === ticket.shiftId && row.status === "paid" &&
        (row.guestCount ?? 0) - (row.returningGuestCount ?? 0) - (row.waivedCoverCount ?? 0) > 0 &&
        (row.amountPaid ?? 0) > 0);
    const source = candidates.find(row => row.id === sourceId);
    const availableOnSource = source
        ? source.guestCount! - (source.returningGuestCount ?? 0) - (source.waivedCoverCount ?? 0)
        : 0;
    const whole = (n: number) => Number.isSafeInteger(n) && n >= 0;
    const valid = guestCount > 0 && whole(returning) && whole(waived) &&
        returning + waived <= guestCount &&
        (returning === 0 || (source !== undefined && availableOnSource >= returning)) &&
        reason.trim().length > 0 && reason.trim().length <= 255;
    const paidCovers = Math.max(0, guestCount - waived - returning);
    const money = (v: number) => "¥" + v.toLocaleString("ja-JP");

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!valid || locked.current) return;
        locked.current = true;
        setPending(true);
        setError("");
        try {
            const saved = await onSave({
                returning_guest_count: returning, waived_cover_count: waived,
                returning_from_ticket_id: returning > 0 ? sourceId : null,
                reason: reason.trim(),
            });
            if (!saved) setError(ja
                ? "変更を確認できませんでした。伝票の状態を確認してから再試行してください。"
                : "Cover adjustment not confirmed. Check the ticket before trying again.");
        } catch {
            setError(ja
                ? "サーバーからの応答を確認できません。伝票を更新してご確認ください。"
                : "The server response was uncertain. Refresh the ticket before retrying.");
        } finally {
            locked.current = false;
            setPending(false);
        }
    }

    return <Form onSubmit={event => void submit(event)}>
        <p className="cover-note">{ja
            ? "客数はそのままで、免除するカバー料金だけを調整できます。"
            : "Waive covers without removing guests from attendance."}</p>
        <div className="cover-summary-row"><span>{ja ? "伝票の客数" : "Guests on ticket"}</span><strong>{guestCount}</strong></div>
        <label>{ja ? "カバー免除人数" : "Guests with waived cover"}
            <input type="number" min={0} max={guestCount} step={1} inputMode="numeric"
                disabled={pending} value={waived} onChange={event => setWaived(Number(event.target.value))}/>
        </label>
        <label>{ja ? "再来店人数（すでにカバー支払済）" : "Returning guests (cover already paid)"}
            <input type="number" min={0} max={guestCount} step={1} inputMode="numeric"
                disabled={pending} value={returning} onChange={event => setReturning(Number(event.target.value))}/>
        </label>
        {returning > 0 ? <label>{ja ? "前回の支払済み伝票" : "Original paid ticket (same shift)"}
            <select required disabled={pending} value={sourceId ?? ""}
                onChange={event => setSourceId(event.target.value ? Number(event.target.value) : null)}>
                <option value="">{ja ? "支払済み伝票を選択" : "Select paid ticket"}</option>
                {candidates.map(row => <option key={row.id} value={row.id}>
                    #{row.id} {row.name} · {row.guestCount ?? 0} {ja ? "名" : "guests"}
                </option>)}
            </select>
            <small>{ja
                ? "同じ営業シフト内の支払済み伝票が必要です。利用可能人数はサーバー側で最終確認します。"
                : "Requires an earlier paid ticket from this shift. The server verifies remaining cover claims."}</small>
        </label> : null}
        <label>{ja ? "変更理由" : "Reason"}
            <input required maxLength={255} disabled={pending} value={reason}
                onChange={event => setReason(event.target.value)} />
        </label>
        <Summary aria-live="polite">
            <span>{ja ? "カバー通常料金" : "Standard cover"} ({guestCount} × {money(coverPrice)})</span>
            <strong>{money(guestCount * coverPrice)}</strong>
            <span>{ja ? "免除・再来店割引" : "Waived / returning discount"}</span>
            <strong>−{money((waived + returning) * coverPrice)}</strong>
            <span>{ja ? "請求対象人数" : "Chargeable covers"}</span>
            <strong>{paidCovers}</strong>
            <span>{ja ? "カバー請求額" : "Cover due"}</span>
            <strong>{money(paidCovers * coverPrice)}</strong>
            <span>{ja ? "来店人数（変わりません）" : "Total visitors (unchanged)"}</span>
            <strong>{guestCount}</strong>
        </Summary>
        {!valid && <p role="alert">{ja
            ? "免除と再来店の合計は客数以下にしてください。再来店には対応する支払済み伝票と理由が必要です。"
            : "Waived plus returning guests cannot exceed attendance; returns require a paid source and a reason."}</p>}
        {error && <p role="alert">{error}</p>}
        <Actions>
            <button type="button" className="hollow secondary" disabled={pending} onClick={onCancel}>
                {ja ? "キャンセル" : "Cancel"}
            </button>
            <button type="submit" disabled={pending || !valid}>
                {pending ? (ja ? "保存中…" : "Saving…") : (ja ? "カバー免除を適用" : "Apply cover adjustment")}
            </button>
        </Actions>
    </Form>;
}

const Form = styled.form`
    display: flex; flex-direction: column; gap: var(--space-2); min-width: 0;
    padding: var(--space-2);
    label { display: flex; flex-direction: column; gap: var(--space-1); }
    input, select { width: 100%; min-width: 0; box-sizing: border-box; min-height: 44px; }
    .cover-note { color: var(--neutral-300); }
    .cover-summary-row { display: flex; justify-content: space-between; }
`;
const Summary = styled.div`
    display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-1);
    background: var(--neutral-900); padding: var(--space-2); border-radius: var(--space-1);
    strong { font-variant-numeric: tabular-nums; }
`;
const Actions = styled.div`
    display: flex; gap: var(--space-1); flex-wrap: wrap;
    button { flex: 1; min-height: 44px; }
`;
