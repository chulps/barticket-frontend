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

    onAddStaffDrink: (ticketId: number, staffId: number, menuItemId: number | null, priceKey: string, quantity: number) => void;

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

    const total = ticket?.items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    ) ?? 0;

    if (!ticket) {
        return null;
    }

    return (
        <TicketDetailsContainer>


            <TicketDetailsHeader
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
            
            <TicketItems
                ticket={ticket}
                menu={menu}
                activeTab={activeTab}
                editingPriceItemId={editingPriceItemId}
                setEditingPriceItemId={setEditingPriceItemId}
                onUpdateQuantity={onUpdateQuantity}
                onUpdatePrice={onUpdatePrice}
                onRemoveItem={onRemoveItem}
                onAddItem={onAddItem}
                onAddStaffDrink={onAddStaffDrink}
            />

            <TicketFooter
                ticket={ticket}
                activeTab={activeTab}
                total={total}
                onCancelTicket={onCancelTicket}
                onPayTicket={onPayTicket}
                onReopenTicket={onReopenTicket}
            />
        </TicketDetailsContainer >
    );
}

const TicketDetailsContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: visible;
`;