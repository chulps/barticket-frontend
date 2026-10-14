// TicketFooter.tsx

import styled from "styled-components";

// UI components
import TicketActions from "./TicketActions";
import { useI18n } from "../../i18n";

// Types
import type { PaymentType, Ticket } from "../../types/Ticket";

type TicketFooterProps = {
    ticket: Ticket;
    activeTab: "open" | "paid" | "cancelled";
    total: number;

    onCancelTicket: (ticketId: number) => void;

    onPayTicket: (
        ticketId: number,
        paymentType: PaymentType,
    ) => void;

    onReopenTicket: (ticketId: number, reason: "customer_returned" | "closed_by_mistake") => void;
};

export default function TicketFooter({
    ticket,
    activeTab,
    total,
    onCancelTicket,
    onPayTicket,
    onReopenTicket,
}: TicketFooterProps) {
    const { t } = useI18n();

    return (
        <Footer>
            <Totals>
                <Row>
                    <label>{t("total")}</label>
                    <data>¥{total.toLocaleString()}</data>
                </Row>
                {(ticket.amountPaid ?? 0) > 0 && (
                    <Row><label>Already paid / 支払済</label><data>−¥{ticket.amountPaid?.toLocaleString()}</data></Row>
                )}
                {ticket.status === "open" && (
                    <Row><strong>Balance due / 残額</strong><strong>¥{(ticket.balanceDue ?? Math.max(0, total - (ticket.amountPaid ?? 0))).toLocaleString()}</strong></Row>
                )}
            </Totals>

            <Actions>
                <TicketActions
                    ticket={ticket}
                    activeTab={activeTab}
                    onCancelTicket={onCancelTicket}
                    onPayTicket={onPayTicket}
                    onReopenTicket={onReopenTicket}
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