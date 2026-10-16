//Ticket.tsx

// import react stuff
import { useState } from "react";

//import styling package
import styled from "styled-components";

//import UI components
import PaidTicketSummary from "./PaidTicketSummary"
import TicketDetailsHeader from "./TicketHeader"
import TicketItems from "./TicketItems";
import TicketFooter from "./TicketFooter"

// import types
import type { MenuData, MenuItem, Prices } from "../../types/Menu";
import type { Ticket, PaymentType } from "../../types/Ticket";

// types/props
type TicketDetailsProps = {
    ticket: Ticket | null;
    menu: MenuData | null;
    tickets: Ticket[];

    onUpdateQuantity: (
        ticketId: number,
        itemId: number,
        change: number
    ) => void;

    onUpdatePrice: (
        ticketId: number,
        itemId: number,
        price: number
    ) => void;

    onRemoveItem: (
        ticketId: number,
        itemId: number
    ) => void;

    onAddItem: (
        ticketId: number,
        menuItem: MenuItem,
        priceKey: keyof Prices,
        unitPrice: number,
        quantity: number
    ) => void;

    onAddStaffDrink: (ticketId: number, staffId: number, menuItemId: number | null, priceKey: string, quantity: number, details?: { name: string; staffName: string; price: number }) => void;

    onCancelTicket: (ticketId: number) => void;

    activeTab: "open" | "paid" | "cancelled";

    onPayTicket: (
        ticketId: number,
        paymentType: PaymentType,
    ) => void;

    onClose: () => void;
    onPrevious: () => void;
    onNext: () => void;

    hasPrevious: boolean;
    hasNext: boolean;

    onUpdateName: (ticketId: number, name: string) => void;

    onReopenTicket: (ticketId: number) => void;
};

// component
export default function TicketDetails({
    ticket,
    menu,
    tickets,
    onUpdateQuantity,
    onUpdatePrice,
    onAddItem,
    onAddStaffDrink,
    onRemoveItem,
    onCancelTicket,
    activeTab,
    onPayTicket,
    onClose,
    onPrevious,
    onNext,
    hasPrevious,
    hasNext,
    onUpdateName,
    onReopenTicket,
}: TicketDetailsProps) {

    const [editingPriceItemId, setEditingPriceItemId] = useState<number | null>(null);
    const [closingTicketId, setClosingTicketId] = useState<number | null>(null);

    const total = ticket?.items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    ) ?? 0;

    if (!ticket) {
        return null;
    }

    const closing = activeTab === "open" && closingTicketId === ticket.id;
    const closingMessage = "Choose payment or cancel this ticket";

    return (
        <TicketDetailsContainer>


            <TicketDetailsHeader
                key={ticket.id}
                ticket={ticket}
                activeTab={activeTab}
                onClose={onClose}
                onPrevious={onPrevious}
                onNext={onNext}
                hasPrevious={hasPrevious}
                hasNext={hasNext}
                onUpdateName={onUpdateName}
            />

            {ticket?.status === "paid" && (
                <PaidTicketSummary ticket={ticket} />
            )}
            
            {closing ? (
                <CloseStepMessage>{/* This is a view change only; ticket stays open until payment or cancellation. */}
                    {/** Text comes from the active language and should not imply payment has happened. */}
                    <span>{closingMessage}</span>
                </CloseStepMessage>
            ) : <TicketItems
                ticket={ticket}
                menu={menu}
                tickets={tickets}
                activeTab={activeTab}
                editingPriceItemId={editingPriceItemId}
                setEditingPriceItemId={setEditingPriceItemId}
                onUpdateQuantity={onUpdateQuantity}
                onUpdatePrice={onUpdatePrice}
                onRemoveItem={onRemoveItem}
                onAddItem={onAddItem}
                onAddStaffDrink={onAddStaffDrink}
            />}

            <TicketFooter
                ticket={ticket}
                closing={closing}
                onEnterClose={() => setClosingTicketId(ticket.id)}
                onBackToItems={() => setClosingTicketId(null)}
                activeTab={activeTab}
                total={total}
                onCancelTicket={onCancelTicket}
                onPayTicket={onPayTicket}
                onReopenTicket={onReopenTicket}
            />
        </TicketDetailsContainer >
    );
}

const CloseStepMessage = styled.section`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--space-3);
  color: var(--neutral-300);
`;

const TicketDetailsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: visible;
`;