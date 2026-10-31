// TicketActions.tsx
import styled from "styled-components";

import Icon from "../Icon";
import PaymentModal from "../PaymentModal";
import ReceiptPreview from "./ReceiptPreview";
import ReopenTicketModal from "./ReopenTicketModal";
import DeferPaymentModal from "./DeferPaymentModal";

// Types
import type { CollectionDateConfirmation, PaymentType, Ticket } from "../../types/Ticket";

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
        amount: number,
        idempotencyKey?: string,
        collection?: CollectionDateConfirmation,
    ) => Promise<boolean>;
    onDeferTicket: (ticketId: number, body: { reason: string; confirmed_balance: number; note?: string; follow_up_date?: string }) => Promise<boolean>;

    onReopenTicket: (ticketId: number, reason: "customer_returned" | "closed_by_mistake") => Promise<boolean>;
    canCorrectPayment: boolean;
};

export default function TicketActions({
    ticket,
    closing,
    onEnterClose,
    onBackToItems,
    activeTab,
    onCancelTicket,
    onPayTicket,
    onDeferTicket,
    onReopenTicket,
    canCorrectPayment,
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
                                    canConfirmCollectionDate={canCorrectPayment}
                                    onConfirm={(paymentType, amount, key, collection) =>
                                        onPayTicket(ticket.id, paymentType, amount, key, collection)
                                    }
                                />
                            ),
                        })
                    }
                >
                    <Icon name="Money" />
                    {t("takePayment")}
                </ActionButton>
                {ticket.serviceStatus !== "completed" ? <ActionButton className="hollow" onClick={() => openModal({
                    title: locale === "ja" ? "未払い残高を繰り越す" : "Carry forward unpaid balance",
                    maxWidth: "520px",
                    content: <DeferPaymentModal ticket={ticket} onDefer={body => onDeferTicket(ticket.id, body)} />,
                })}>
                    {locale === "ja" ? "未払いとして保存" : "Mark unpaid / carry balance"}
                </ActionButton> : null}
            </ButtonActions>
        );
    }

    if (activeTab === "paid") {
        return (
            <ButtonActions $row>
                <ActionButton className="hollow secondary" onClick={() => openModal({
                    title: locale === "ja" ? "領収書をメールで送信" : "Email receipt",
                    content: <ReceiptPreview ticket={ticket} />,
                    fitContent: true,
                    maxWidth: "520px",
                })}>
                    <Icon name="EnvelopeSimple" />
                    {t("emailReceipt")}
                </ActionButton>

                <ActionButton
                    className="hollow"
                    onClick={() => openModal({
                        title: locale === "ja" ? "伝票を再開する" : "Reopen paid ticket",
                        maxWidth: "480px",
                        content: <ReopenTicketModal canCorrectPayment={canCorrectPayment}
                            onReopen={(reason) => onReopenTicket(ticket.id, reason)} />,
                    })}
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
            /* DOM order and visual order must match for keyboard/VoiceOver.
               Back → Cancel → Take Payment stays predictable on phones. */
            flex-direction: column;
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
    min-height: 44px;
    touch-action: manipulation;

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

