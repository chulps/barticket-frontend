// TicketActions.tsx
import styled from "styled-components";

import Icon from "../Icon";
import PaymentModal from "../PaymentModal";

// Types
import type { PaymentType, Ticket } from "../../types/Ticket";

// Hooks
import { useModal } from "../../hooks/useModal";
import { useI18n } from "../../i18n";

type TicketActionsProps = {
    ticket: Ticket;
    activeTab: "open" | "paid" | "cancelled";

    onCancelTicket: (ticketId: number) => void;

    onPayTicket: (
        ticketId: number,
        paymentType: PaymentType,
    ) => void;

    onReopenTicket: (ticketId: number) => void;
};

export default function TicketActions({
    ticket,
    activeTab,
    onCancelTicket,
    onPayTicket,
    onReopenTicket
}: TicketActionsProps) {
    const { openModal } = useModal();
    const { t } = useI18n();

    if (activeTab === "open") {
        return (
            <ButtonActions>
                <ActionButton
                    className="hollow danger"
                    onClick={() => onCancelTicket(ticket.id)}
                >
                    <Icon name="X" />
                    {t("cancelTicket")}
                </ActionButton>

                <ActionButton
                    className="hollow success"
                    onClick={() =>
                        openModal({
                            title: t("takePayment"),
                            content: (
                                <PaymentModal
                                    ticket={ticket}
                                    onConfirm={(paymentType) =>
                                        onPayTicket(ticket.id, paymentType)
                                    }
                                />
                            ),
                        })
                    }
                >
                    <Icon name="Money" />
                    {t("takePayment")}
                </ActionButton>
            </ButtonActions>
        );
    }

    if (activeTab === "paid") {
        return (
            <ButtonActions>
                <ActionButton className="hollow secondary">
                    <Icon name="EnvelopeSimple" />
                    {t("emailReceipt")}
                </ActionButton>

                <ActionButton 
                    className="hollow"
                    onClick={() => onReopenTicket(ticket.id)}>
                    <Icon name="ArrowCounterClockwise" />
                    {t("reopenTicket")}
                </ActionButton>

                <ActionButton className="hollow danger">
                    <Icon name="Receipt" />
                    {t("refund")}
                </ActionButton>
            </ButtonActions>
        );
    }

    // Cancelled
    return null;
}

const ButtonActions = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);

    @media (min-width: 768px) {
        flex-direction: row;
        gap: var(--space-2);
    }
`

const ActionButton = styled.button`
    font-size: var(--font-size-h6);
    width: 100%;
    padding: calc(var(--space-0) + var(--space-1));

    @media (min-width: 768px) {
        flex: 1;
        width: auto;
    }
`