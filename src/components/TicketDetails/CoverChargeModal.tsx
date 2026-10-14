import { useState } from "react";
import styled from "styled-components";
import type { Ticket } from "../../types/Ticket";

type CoverAdjustment = { returning_guest_count: number; waived_cover_count: number; returning_from_ticket_id: number | null; reason: string };
type Props = { ticket: Ticket; tickets: Ticket[]; mode: "returning" | "waiver"; onCancel: () => void; onSave: (value: CoverAdjustment) => void };

export default function CoverChargeModal({ ticket, tickets, mode, onCancel, onSave }: Props) {
    const guestCount = ticket.guestCount ?? ticket.items.find(item => item.type === "cover")?.quantity ?? 0;
    const price = ticket.coverChargePerPerson ?? ticket.items.find(item => item.type === "cover")?.unit_price ?? 0;
    const [returning, setReturning] = useState(ticket.returningGuestCount ?? 0);
    const [waived, setWaived] = useState(ticket.waivedCoverCount ?? 0);
    const [source, setSource] = useState<number | null>(ticket.returningFromTicketId ?? null);
    const [reason, setReason] = useState(ticket.coverAdjustmentReason ?? "");
    const candidates = tickets.filter(row => row.id !== ticket.id && row.shiftId === ticket.shiftId && row.status === "paid" && ((row.guestCount ?? 0) - (row.returningGuestCount ?? 0) - (row.waivedCoverCount ?? 0)) > 0 && (row.amountPaid ?? 0) > 0);
    const sourceTicket = candidates.find(row => row.id === source);
    const availableOnSource = sourceTicket ? (sourceTicket.guestCount ?? 0) - (sourceTicket.returningGuestCount ?? 0) - (sourceTicket.waivedCoverCount ?? 0) : 0;
    const valid = guestCount > 0 && returning >= 0 && waived >= 0 && returning + waived <= guestCount && (returning === 0 || (source !== null && availableOnSource >= returning));
    const coverCount = Math.max(0, guestCount - returning - waived);
    return <Form onSubmit={(event) => { event.preventDefault(); if (valid) onSave({ returning_guest_count: returning, waived_cover_count: waived, returning_from_ticket_id: returning ? source : null, reason: reason.trim() }); }}>
        <p>{guestCount} guests · ¥{price.toLocaleString()} each</p>
        <label>Returning guests / 再来店人数
            <input type="number" inputMode="numeric" min="0" max={guestCount} value={returning} onChange={e => setReturning(Number(e.target.value))} />
        </label>
        {returning > 0 && <label>Original paid ticket / 支払済チケット
            <select required value={source ?? ""} onChange={e => setSource(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Select paid ticket...</option>
                {candidates.map(row => <option value={row.id} key={row.id}>{row.name} (#{row.id}) · {((row.guestCount ?? 0) - (row.returningGuestCount ?? 0) - (row.waivedCoverCount ?? 0))} covered</option>)}
            </select>
            {!sourceTicket && <small>Choose a paid ticket from the same shift. Returning guests are not counted twice.</small>}
        </label>}
        <label>Waived covers / チャージ免除人数
            <input type="number" inputMode="numeric" min="0" max={guestCount} value={waived} onChange={e => setWaived(Number(e.target.value))} />
        </label>
        <label>Reason / 理由
            <input value={reason} maxLength={255} onChange={e => setReason(e.target.value)} placeholder={mode === "waiver" ? "Complimentary entry" : "Returning after paying cover"} />
        </label>
        <Summary>
            <span>New guests counted / 新規客数</span><strong>{guestCount - returning}</strong>
            <span>Chargeable covers</span><strong>{coverCount}</strong>
            <span>Cover total</span><strong>¥{(coverCount * price).toLocaleString()}</strong>
            <span>Waived / returning covers</span><strong>−¥{((returning + waived) * price).toLocaleString()}</strong>
        </Summary>
        {!valid && <small role="alert">Returning and waived covers cannot exceed guests. Returning guests need an earlier paid ticket with enough covered guests.</small>}
        <Actions><button type="button" className="hollow" onClick={onCancel}>Cancel</button><button type="submit" disabled={!valid}>Apply Cover Adjustment</button></Actions>
    </Form>;
}
const Form = styled.form`display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2); min-width: 0; label {display: flex; flex-direction: column; gap: var(--space-1);} input, select {width: 100%; min-width: 0; box-sizing: border-box;} small {color: var(--neutral-400);}`;
const Summary = styled.div`display: grid; grid-template-columns: 1fr auto; gap: var(--space-1); background: var(--neutral-900); padding: var(--space-2); border-radius: var(--space-1);`;
const Actions = styled.div`display: flex; gap: var(--space-1); button {flex: 1;}`;
