// TicketActions.tsx

import Icon from "../Icon";
import PaymentModal from "../PaymentModal";

// Types
import type { PaymentType, Ticket } from "../../types/Ticket";

// Hooks
import { useModal } from "../../hooks/useModal";

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

    if (activeTab === "open") {
        return (
            <>
                <button
                    className="hollow danger"
                    onClick={() => onCancelTicket(ticket.id)}
                >
                    <Icon name="X" />
                    Cancel Ticket
                </button>

                <button
                    className="hollow success"
                    onClick={() =>
                        openModal({
                            title: "Take Payment",
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
                    Take Payment
                </button>
            </>
        );
    }

    if (activeTab === "paid") {
        return (
            <>
                <button className="hollow">
                    <Icon name="EnvelopeSimple" />
                    Email Receipt
                </button>

                <button 
                    className="hollow"
                    onClick={() => onReopenTicket(ticket.id)}>
                    <Icon name="ArrowCounterClockwise" />
                    Reopen Ticket
                </button>

                <button className="hollow danger">
                    <Icon name="Receipt" />
                    Refund
                </button>
            </>
        );
    }

    // Cancelled
    return null;
}