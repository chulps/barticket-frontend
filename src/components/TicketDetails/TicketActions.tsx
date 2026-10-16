// TicketActions.tsx
import styled from "styled-components";
import { useState } from "react";

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
    onReopenTicket,
}: TicketActionsProps) {
    const { openModal, closeModal } = useModal();
    const { t, locale } = useI18n();
    const [confirmingClose, setConfirmingClose] = useState(false);

    const confirmCancellation = () => {
        openModal({
            title: locale === "ja" ? "チケットのキャンセル確認" : "Cancel ticket?",
            content: (
                <ConfirmCancellation>
                    <p>{locale === "ja" ? "本当にこのチケットをキャンセルしますか？" : "Are you sure you want to cancel this ticket?"}</p>
                    <ConfirmActions>
                        <button type="button" className="hollow secondary" onClick={closeModal} autoFocus>
                            {locale === "ja" ? "いいえ" : "No"}
                        </button>
                        <button type="button" className="danger" onClick={() => { closeModal(); onCancelTicket(ticket.id); }}>
                            {locale === "ja" ? "はい、キャンセルする" : "Yes, cancel ticket"}
                        </button>
                    </ConfirmActions>
                </ConfirmCancellation>
            ),
        });
    };

    if (activeTab === "open" && !confirmingClose) {
        return <ActionButton type="button" className="hollow secondary" onClick={() => setConfirmingClose(true)}>
            <Icon name="CheckCircle" />
            {locale === "ja" ? "チケットを閉じる" : "Close ticket"}
        </ActionButton>;
    }

    if (activeTab === "open") {
        return (
            <ButtonActions $row>
                <ActionButton type="button" className="hollow secondary"
                    onClick={() => setConfirmingClose(false)}>
                    <Icon name="ArrowLeft" />
                    {t("back")}
                </ActionButton>
                <ActionButton
                    className="hollow danger"
                    onClick={confirmCancellation}
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
            <ButtonActions $row>
                <ActionButton className="hollow secondary">
                    <Icon name="EnvelopeSimple" />
                    {t("emailReceipt")}
                </ActionButton>

                <ActionButton
                    className="hollow"
                    onClick={() => onReopenTicket(ticket.id)}
                >
                    <Icon name="ArrowCounterClockwise" />
                    {t("reopenTicket")}
                </ActionButton>
            </ButtonActions>
        );
    }

    // Cancelled
    return null;
}

const ButtonActions = styled.div<{ $row?: boolean }>`
    display: flex;
    flex-direction: ${({ $row }) => ($row ? "row" : "column")};
    gap: var(--space-1);
    width: 100%;

    ${({ $row }) =>
        $row &&
        `
        && > button {
            flex: 1;
            width: auto;
        }

        @media (max-width: 767px) {
            && > button {
                padding-left: var(--space-1);
                padding-right: var(--space-1);

                &:hover {
                    transform: none;
                }
            }
        }
    `}

    @media (min-width: 768px) {
        flex-direction: row;
        gap: var(--space-2);
    }
`

const ActionButton = styled.button`
    font-size: var(--font-size-h6);
    width: 100%;
    min-width: 0;
    padding: calc(var(--space-0) + var(--space-1));
    justify-content: center;

    @media (min-width: 768px) {
        flex: 1;
        width: auto;
    }
`
const ConfirmCancellation = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    min-width: 0;

    p { margin: 0; }
`;

const ConfirmActions = styled.div`
    display: flex;
    gap: var(--space-2);

    button { flex: 1; min-width: 0; }

    @media (max-width: 479px) {
        flex-direction: column;
    }
`;
