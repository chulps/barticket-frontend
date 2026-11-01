import { settlementLabel, unpaidReasonLabel } from "../settlementLabels";
import PaymentDateHistory from "../PaymentDateHistory";
// TicketFooter.tsx

import styled from "styled-components";

// UI components
import TicketActions from "./TicketActions";
import { useI18n } from "../../i18n";

// Types
import type { CollectionDateConfirmation, PaymentType, Ticket } from "../../types/Ticket";

type TicketFooterProps = {
    ticket: Ticket;
    closing: boolean;
    onEnterClose: () => void;
    onBackToItems: () => void;
    activeTab: "open" | "paid" | "cancelled";
    total: number;

    onCancelTicket: (ticketId: number) => void;

    onPayTicket: (
        ticketId: number,
        paymentType: PaymentType,
        amount: number,
        idempotencyKey?: string,
        collection?: CollectionDateConfirmation,
    ) => Promise<Ticket | null>;
    onDeferTicket: (ticketId: number, body: { reason: string; confirmed_balance: number; note?: string; follow_up_date?: string }) => Promise<boolean>;

    onReopenTicket: (ticketId: number, reason: "customer_returned" | "closed_by_mistake") => Promise<boolean>;
    canCorrectPayment: boolean;
};

export default function TicketFooter({
    ticket,
    closing,
    onEnterClose,
    onBackToItems,
    activeTab,
    total,
    onCancelTicket,
    onPayTicket,
    onDeferTicket,
    onReopenTicket,
    canCorrectPayment,
}: TicketFooterProps) {
    const { t, locale } = useI18n();

    return (
        <Footer>
            <Totals>
                <Row>
                    <label>{t("total")}</label>
                    <data>¥{total.toLocaleString()}</data>
                </Row>
                {(ticket.waivedCoverCount ?? 0) + (ticket.returningGuestCount ?? 0) > 0 ? <>
                    <Row>
                        <small>{locale === "ja" ? "来店人数" : "Guests counted"}</small>
                        <small>{ticket.guestCount ?? 0}</small>
                    </Row>
                    {(ticket.waivedCoverCount ?? 0) > 0 && <Row>
                        <small>{locale === "ja" ? "カバー免除" : "Waived covers"}</small>
                        <small>{ticket.waivedCoverCount}</small>
                    </Row>}
                    {(ticket.returningGuestCount ?? 0) > 0 && <Row>
                        <small>{locale === "ja" ? "再来店（重複計上なし）" : "Returning guests (not recounted)"}</small>
                        <small>{ticket.returningGuestCount}</small>
                    </Row>}
                </> : null}
                {ticket.amountPaid !== undefined && ticket.amountPaid > 0 ? <Row>
                    <small>Already paid / 支払済</small>
                    <small>¥{ticket.amountPaid.toLocaleString()}</small>
                </Row> : null}
                {ticket.balanceDue !== undefined && ticket.status === "open" ? <Row>
                    <strong>{locale === "ja" ? "お支払い残額" : "Balance due"}</strong>
                    <strong>¥{ticket.balanceDue.toLocaleString()}</strong>
                </Row> : null}
                {(ticket.payments?.length ?? 0) > 0 && <details>
                    <summary style={{ fontSize: "var(--font-size-small)", cursor: "pointer" }}>
                        {locale === "ja" ? "お支払い履歴" : "Payment history"} ({ticket.payments?.length})
                    </summary>
                    <PaymentDateHistory ticket={ticket} canCorrect={canCorrectPayment} />
                </details>}
                {ticket.serviceStatus === "completed" && ticket.deferredAt ? <section aria-label={locale === "ja" ? "未払い情報" : "Unpaid balance details"}>
                    <p><strong>{locale === "ja" ? "サービス営業日" : "Service date"}:</strong> {ticket.serviceBusinessDate ?? "—"}</p>
                    <p><strong>{locale === "ja" ? "状態" : "Settlement"}:</strong> {settlementLabel(ticket.settlementStatus ?? "outstanding", locale === "ja")}</p>
                    <p><strong>{locale === "ja" ? "理由" : "Reason"}:</strong> {unpaidReasonLabel(ticket.unpaidReason, locale === "ja")}</p>
                    {ticket.followUpDate ? <p><strong>{locale === "ja" ? "フォロー日" : "Follow-up"}:</strong> {ticket.followUpDate}</p> : null}
                    {ticket.unpaidNote ? <p><strong>{locale === "ja" ? "スタッフメモ" : "Staff note"}:</strong> {ticket.unpaidNote}</p> : null}
                    {(ticket.writeOffs?.length ?? 0) > 0 ? <ul>{ticket.writeOffs?.map((row, index) => <li key={index}>
                        {locale === "ja" ? "免除" : "Written off"} · ¥{row.amount.toLocaleString()} · {row.reason} · {row.written_off_by}
                    </li>)}</ul> : null}
                </section> : null}
            </Totals>

            <Actions>
                <TicketActions
                    key={ticket.id}
                    ticket={ticket}
                    closing={closing}
                    onEnterClose={onEnterClose}
                    onBackToItems={onBackToItems}
                    activeTab={activeTab}
                    onCancelTicket={onCancelTicket}
                    onPayTicket={onPayTicket}
                    onDeferTicket={onDeferTicket}
                    onReopenTicket={onReopenTicket}
                    canCorrectPayment={canCorrectPayment}
                />
            </Actions>
        </Footer>
    );
}

const Footer = styled.footer`
    display: flex;
    flex-direction: column;

    gap: var(--space-1);
    padding-top: var(--space-1);
    border-top: 1px solid var(--neutral-800);

    @media (max-width: 767px) {
        position: sticky;
        bottom: 0;
        z-index: 5;
        flex-shrink: 0;
        background: var(--neutral-950);
        padding-bottom: calc(var(--space-1) + env(safe-area-inset-bottom, 0px));
    }

    @media (min-width: 768px) {
        padding-top: var(--space-3);
        gap: var(--space-3);
    }

    @media (min-height: 400px) {
        gap: var(--space-2);
        padding-top: var(--space-2);
    }
`;

const Totals = styled.div`
    display: flex;
    flex-direction: column;
    font-size: var(--font-size-h4);
`;

const Row = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const Actions = styled.div`
    display: flex;
    gap: var(--space-2);

    > * {
        flex: 1;
    }

    flex-direction: column-reverse;

    @media screen and (min-width: 768px) {
        flex-direction: row;
    }
`;

