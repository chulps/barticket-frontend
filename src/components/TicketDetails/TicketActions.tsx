// TicketActions.tsx
import styled from "styled-components";

import Icon from "../Icon";
import PaymentModal from "../PaymentModal";
import ReceiptPreview from "./ReceiptPreview";

// Types
import type { PaymentType, Ticket } from "../../types/Ticket";

// Hooks
import { useModal } from "../../hooks/useModal";
import { useI18n } from "../../i18n";

type TicketActionsProps = {
    ticket: Ticket;
    closing: boolean;
    onEnterClose: () => void;
    onBackToItems: () => void;
    activeTab: "open" | "paid" | "cancelled";

    onCancelTicket: (ticketId: number) => void;

    onPayTicket: (
        ticketId: number,
        paymentType: PaymentType,
    ) => Promise<boolean>;

    onReopenTicket: (ticketId: number) => void;
};

export default function TicketActions({
    ticket,
    closing,
    onEnterClose,
    onBackToItems,
    activeTab,
    onCancelTicket,
    onPayTicket,
    onReopenTicket,
}: TicketActionsProps) {
    const { openModal, closeModal } = useModal();
    const { t, locale } = useI18n();

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

    if (activeTab === "open" && !closing) {
        return <ActionButton type="button" className="hollow secondary" onClick={onEnterClose}>
            <Icon name="CheckCircle" />
            {locale === "ja" ? "チケットを閉じる" : "Close ticket"}
        </ActionButton>;
    }

    if (activeTab === "open") {
        return (
            <ButtonActions $row>
                <ActionButton type="button" className="hollow secondary"
                    onClick={onBackToItems}>
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
                <ActionButton className="hollow secondary" onClick={() => openModal({
                    title: locale === "ja" ? "領収書メール（プレビュー）" : "Email receipt — preview",
                    content: <ReceiptPreview ticket={ticket} />,
                    fitContent: true,
                    maxWidth: "520px",
                })}>
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
            flex-direction: column-reverse;
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
