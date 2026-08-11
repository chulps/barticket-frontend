// src/components/Sidebar.tsx

// import npm packages
import styled from "styled-components";

// import types
import type { Ticket } from "../types/Ticket";

// import UI components
import TicketListItem from "./TicketListItem";
import TabGroup from "./TabGroup";
import Icon from "./Icon";

// props
type SidebarProps = {
  activeTab: "open" | "paid" | "cancelled";
  setActiveTab: (tab: "open" | "paid" | "cancelled") => void;

  tickets: Ticket[];
  visibleTickets: Ticket[];
  selectedTicketId: number;
  setSelectedTicketId: (id: number) => void;
  setShowTicketDetails: (show: boolean) => void;

  handleCreateTicket: () => void;
  getTicketTotal: (ticket: Ticket) => number;

  lastSelectedTicket: {
    open?: number;
    paid?: number;
    cancelled?: number;

  };

  setLastSelectedTicket: React.Dispatch<
    React.SetStateAction<{
      open?: number;
      paid?: number;
      cancelled?: number;
    }>
  >;
};

// component
export default function TicketSidebar({
  activeTab,
  tickets,
  visibleTickets,
  selectedTicketId,
  lastSelectedTicket,
  setActiveTab,
  setSelectedTicketId,
  setShowTicketDetails,
  handleCreateTicket,
  getTicketTotal,
  setLastSelectedTicket,
}: SidebarProps) {

  // toggle for deactiving UI elements depending on which tab is selected
  const isEditable = activeTab === "open";

  const emptyMessages = {
    open: "No open tickets. Click the 'New Ticket' button to add a ticket.",
    paid: "No paid tickets",
    cancelled: "No cancelled tickets",
  };

  // render
  return (

    <SidebarContainer>

      <SidebarHeader>
        <label>
          {/* add the local date and time here */}
        </label>
        <TabGroup
          tabs={[
            { id: "open", label: "Open" },
            { id: "paid", label: "Paid" },
            { id: "cancelled", label: "Cancelled" },
          ]}
          activeTab={activeTab}
          onChange={(tab) => {
            setActiveTab(tab);

            const rememberedId = lastSelectedTicket[tab];

            const ticket =
              tickets.find((t) => t.id === rememberedId) ??
              tickets.find((t) => t.status === tab);

            if (ticket) {
              setSelectedTicketId(ticket.id);
            }
          }}
        />

      </SidebarHeader>

      <button
        disabled={!isEditable}
        onClick={handleCreateTicket} >
        <Icon name="Plus" />
        New Ticket
      </button>


      <TicketList>
        {visibleTickets.length === 0 ? (
          <EmptyTicketDetails>
            {emptyMessages[activeTab]}
          </EmptyTicketDetails>
        ) : (
          visibleTickets.map((ticket) => (
            <TicketListItem
              key={ticket.id}
              id={ticket.id}
              name={ticket.name}
              total={getTicketTotal(ticket)}
              selected={ticket.id === selectedTicketId}
              onClick={() => {
                setSelectedTicketId(ticket.id);

                setLastSelectedTicket((prev) => ({
                  ...prev,
                  [activeTab]: ticket.id,
                }));

                setShowTicketDetails(true);
              }}
            />
          ))
        )}
      </TicketList>
    </SidebarContainer>

  )
}

// styling
const SidebarContainer = styled.aside`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-2);

  @media (min-width: 768px) {
    padding-right: var(--space-2);
    height: calc(100vh - 100px);
  }
`;

const SidebarHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
`;

const TicketList = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    overflow: auto;
    height: 100%;
    padding: var(--space-1);
    margin-bottom: var(--space-1);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-2);
`;

const EmptyTicketDetails = styled.p`
  border: 1px dashed var(--neutral-500);
  color: var(--neutral-500);
  display: flex;
  justify-content: center;
  border-radius: var(--space-1);
  padding: var(--space-1);
`