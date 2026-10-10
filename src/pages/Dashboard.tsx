// src/pages/Dashboard.tsx

// import react stuff
import { useState } from "react";

// import npm packages
import styled from "styled-components";

// import UI components
import TicketDetails from "../components/TicketDetails/Ticket"
import TicketSidebar from "../components/TicketSidebar";

// import types
import type { MenuData } from "../types/Menu";
import type { Ticket, PaymentType } from "../types/Ticket"

// import hooks 
import { useTickets } from "../hooks/useTickets"; // (business logic for creating or updating tickets)

type DashboardProps = {
  menu: MenuData | null;
  loadingMenu: boolean;
}

// component setup
export default function Dashboard({
  menu,
  loadingMenu,
}: DashboardProps) {

  // States
  const [activeTab, setActiveTab] = useState<"open" | "paid" | "cancelled">("open");
  const [selectedTicketId, setSelectedTicketId] = useState(1);
  const [showTicketDetails, setShowTicketDetails] = useState(false);

  // business logic for updating or creating new tickets (../hooks/useTickets.ts)
  const {
    tickets,
    updateItemQuantity,
    updateItemPrice,
    addItemToTicket,
    updateTicketName,
    removeItemFromTicket,
    createTicket,
    cancelTicket,
    payTicket,
    reopenTicket
  } = useTickets();

  // UI actions
  // Controls tab group showing open, paid, or cancelled tickets
  const visibleTickets = tickets.filter(
    (ticket) => ticket.status === activeTab
  );

  // answers which ticket is currently being displayed in ticket details?
  const currentIndex = visibleTickets.findIndex(
    (ticket) => ticket.id === selectedTicketId
  );

  // answers which ticket is selected in the left column
  const selectedTicket =
    visibleTickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

  // function necessary for mobile users. selects previous ticket while in ticket details view
  const selectPreviousTicket = () => {
    if (currentIndex > 0) {
      setSelectedTicketId(
        visibleTickets[currentIndex - 1].id
      );
    }
  };

  // function necessary for mobile users. selects next ticket while in ticket details view
  const selectNextTicket = () => {
    if (currentIndex < visibleTickets.length - 1) {
      setSelectedTicketId(
        visibleTickets[currentIndex + 1].id
      );
    }
  };

  // calculate the ticket total for the frontend
  const getTicketTotal = (ticket: Ticket) => ticket.items.reduce((sum, item) => sum + item.subtotal, 0);

  // create a new ticket
  // tab switches wait for the backend so a failed request doesn't move the ticket
  const handleCreateTicket = async () => {

    const newTicket = await createTicket();
    if (!newTicket) return;

    setActiveTab("open");
    setSelectedTicketId(newTicket.id);
    setShowTicketDetails(true);

  };

  const handleCancelTicket = async (ticketId: number) => {
    if (!(await cancelTicket(ticketId))) return; // Update the ticket
    setActiveTab("cancelled");       // Switch tabs
    setSelectedTicketId(ticketId);   // Keep this ticket selected
    setShowTicketDetails(true);      // Keep details open
  };

  const handlePayTicket = async (
    ticketId: number,
    paymentType: PaymentType,
  ) => {
    if (!(await payTicket(ticketId, paymentType))) return;

    setActiveTab("paid");
    setSelectedTicketId(ticketId);
    setShowTicketDetails(true);
  };

  const handleReopenTicket = async (ticketId: number) => {
    if (!(await reopenTicket(ticketId))) return;

    setActiveTab("open");
    setSelectedTicketId(ticketId);
    setShowTicketDetails(true);
  };

  const [lastSelectedTicket, setLastSelectedTicket] = useState<{
    open?: number;
    paid?: number;
    cancelled?: number;
  }>({});

  // messages for empty state
  const emptyMessages = {
    open: "No open tickets. Click the 'New Ticket' button to add a ticket.",
    paid: "No paid tickets",
    cancelled: "No cancelled tickets",
  };

  if (loadingMenu) {
    return <data>Loading menu...</data>;
  }


  return (

    <DashboardContainer>
      <TicketSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        tickets={tickets}
        visibleTickets={visibleTickets}
        selectedTicketId={selectedTicketId}
        setSelectedTicketId={setSelectedTicketId}
        setShowTicketDetails={setShowTicketDetails}
        handleCreateTicket={handleCreateTicket}
        getTicketTotal={getTicketTotal}
        lastSelectedTicket={lastSelectedTicket}
        setLastSelectedTicket={setLastSelectedTicket}
      />

      <Content $open={showTicketDetails}>
        {selectedTicket ? (
          <TicketDetails
            key={selectedTicket.id}
            ticket={selectedTicket}
            menu={menu}
            onUpdateQuantity={updateItemQuantity}
            onUpdatePrice={updateItemPrice}
            onAddItem={addItemToTicket}
            onRemoveItem={removeItemFromTicket}
            onUpdateName={updateTicketName}
            onClose={() => setShowTicketDetails(false)}
            onPrevious={selectPreviousTicket}
            onNext={selectNextTicket}
            hasPrevious={currentIndex > 0}
            hasNext={currentIndex < visibleTickets.length - 1}
            onCancelTicket={handleCancelTicket}
            activeTab={activeTab}
            onPayTicket={handlePayTicket}
            onReopenTicket={handleReopenTicket}
          />
        ) : (
          <EmptyTicketDetails>
            {emptyMessages[activeTab]}
          </EmptyTicketDetails>
        )}
      </Content>
    </DashboardContainer>
  );
}

//styling
const DashboardContainer = styled.main`
  display: grid;
  grid-template-columns: var(--space-6) 1fr;
  gap: var(--space-1);
  height: calc(100vh - var(--space-4));
  padding: var(--space-2) 0;

  @media (max-width: 768px) {
    display: block;
  }
`;

const Content = styled.section<{ $open: boolean }>`
  border-left: 1px solid var(--neutral-800);
  padding-left: var(--space-3);

  @media (max-width: 768px) {
    display: ${({ $open }) => $open ? "flex" : "none"};
    flex-direction: column;
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: var(--neutral-950);
    border: none;
    padding: var(--space-2);
  }
`;

const EmptyTicketDetails = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100%;
  color: var(--neutral-500);
`;

// something