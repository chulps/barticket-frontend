//Ticket.tsx

// import react stuff
import { useState } from "react";

//import styling package
import styled from "styled-components";
import { useI18n } from "../../i18n";

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
    ) => Promise<boolean>;

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

    const { locale } = useI18n();
    const [editingPriceItemId, setEditingPriceItemId] = useState<number | null>(null);
    const [closingTicketId, setClosingTicketId] = useState<number | null>(null);

    const total = ticket?.items.reduce(
        (sum, item) => sum + item.subtotal,
        0
    ) ?? 0;

    if (!ticket) {
        return null;
    }

    const navigateFromDraft = (action: () => void) => {
        if (editingPriceItemId !== null && !window.confirm(locale === "ja"
            ? "保存していない価格の変更を破棄しますか？" : "Discard unsaved price changes?")) return;
        setEditingPriceItemId(null);
        action();
    };

    const closing = activeTab === "open" && closingTicketId === ticket.id;
    const closingMessage = locale === "ja" ? "お支払い、またはチケットのキャンセルを選択してください" : "Choose a payment method or cancel this ticket";

    return (
        <TicketDetailsContainer>


            <TicketDetailsHeader
                key={ticket.id}
                ticket={ticket}
                activeTab={activeTab}
                onClose={() => navigateFromDraft(onClose)}
                onPrevious={() => navigateFromDraft(onPrevious)}
                onNext={() => navigateFromDraft(onNext)}
                hasPrevious={hasPrevious}
                hasNext={hasNext}
                onUpdateName={onUpdateName}
            />

            {ticket?.status === "paid" && (
                <PaidTicketSummary ticket={ticket} />
            )}
            
            {closing ? (
                <CloseStepMessage>{closingMessage}</CloseStepMessage>
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
                onCancelTicket={(id) => { setClosingTicketId(null); onCancelTicket(id); }}
                onPayTicket={(id, method) => { setClosingTicketId(null); return onPayTicket(id, method); }}
                onReopenTicket={(id) => { setClosingTicketId(null); onReopenTicket(id); }}
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