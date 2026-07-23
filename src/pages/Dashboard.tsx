// src/pages/Dashboard.tsx

import styled from "styled-components"; 
import { useState, useEffect } from "react"; 
import Icon from "../components/Icon";
import TabGroup from "../components/TabGroup";
import TicketDetails from "../components/TicketDetails"
import TicketListItem from "../components/TicketListItem";

type Ticket = {
  id: number;
  name: string;
  status: "open" | "closed";
  items: {
    type: "cover" | "menu";
    menu_item_id?: number;
    price_key?: string;
    name: string;
    unit_price: number;
    quantity: number;
    subtotal: number;
  }[];
  created_at: number;
  updated_at: number;
  paid_at: number | null;
  cancelled_at: number | null;
};

const initialTickets: Ticket[] = [
  {
    id: 1,
    name: "John",
    status: "open",
    items: [
      {
        type: "cover",
        name: "Cover Charge",
        unit_price: 500,
        quantity: 1,
        subtotal: 500,
      },
      {
        type: "menu",
        menu_item_id: 2,
        name: "Asahi (330mL bottle)",
        price_key: "standard",
        unit_price: 800,
        quantity: 2,
        subtotal: 1600,
      },
      {
        type: "menu",
        menu_item_id: 145,
        name: "Taketsuru Grande",
        price_key: "15ml",
        unit_price: 1400,
        quantity: 1,
        subtotal: 1400,
      },
    ],
    created_at: 1781000000,
    updated_at: 1781010600,
    paid_at: null,
    cancelled_at: null,
  },

  {
    id: 2,
    name: "Sarah",
    status: "open",
    items: [
      {
        type: "cover",
        name: "Cover Charge",
        unit_price: 500,
        quantity: 2,
        subtotal: 1000,
      },
      {
        type: "menu",
        menu_item_id: 8,
        name: "Orion Draft",
        price_key: "standard",
        unit_price: 700,
        quantity: 3,
        subtotal: 2100,
      },
    ],
    created_at: 1781001000,
    updated_at: 1781002200,
    paid_at: null,
    cancelled_at: null,
  },

  {
    id: 3,
    name: "Walk-in",
    status: "closed",
    items: [
      {
        type: "cover",
        name: "Cover Charge",
        unit_price: 500,
        quantity: 1,
        subtotal: 500,
      },
      {
        type: "menu",
        menu_item_id: 20,
        name: "White Russian",
        price_key: "standard",
        unit_price: 1200,
        quantity: 2,
        subtotal: 2400,
      },
    ],
    created_at: 1780990000,
    updated_at: 1780993600,
    paid_at: 1780993600,
    cancelled_at: null,
  },

  {
    id: 4,
    name: "Mike",
    status: "closed",
    items: [
      {
        type: "cover",
        name: "Cover Charge",
        unit_price: 500,
        quantity: 3,
        subtotal: 1500,
      },
      {
        type: "menu",
        menu_item_id: 51,
        name: "Yoichi",
        price_key: "30ml",
        unit_price: 1800,
        quantity: 2,
        subtotal: 3600,
      },
      {
        type: "menu",
        menu_item_id: 9,
        name: "Guinness",
        price_key: "standard",
        unit_price: 900,
        quantity: 1,
        subtotal: 900,
      },
    ],
    created_at: 1780985000,
    updated_at: 1780989200,
    paid_at: 1780989200,
    cancelled_at: null,
  },
];

export default function Dashboard() {

  const [tickets, setTickets] = useState(initialTickets);

  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");

  const [selectedTicketId, setSelectedTicketId] = useState(1);

  const [showTicketDetails, setShowTicketDetails] =
    useState(false);

  useEffect(() => {
    // Demo mode
    localStorage.setItem(
      "tickets",
      JSON.stringify(tickets)
    );

    // Production
    // await api.updateTickets(tickets);

    // or
    // fetch("/api/tickets", {
    //   method: "PUT",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify(tickets),
    // });
  }, [tickets]);

  const visibleTickets = tickets.filter(
    (ticket) => ticket.status === activeTab
  );

  const currentIndex = visibleTickets.findIndex(
    (ticket) => ticket.id === selectedTicketId
  );

  const selectedTicket =
    tickets.find(
      (ticket) => ticket.id === selectedTicketId
    ) ?? null;

  const updateItemQuantity = (
    ticketId: number,   // The ticket we want to modify.
    itemName: string,   // The item within that ticket to modify.
    change: number      // The amount to change the quantity (+1 or -1).
  ) => {

    // Update the tickets state using the previous state.
    setTickets((currentTickets) =>

      // Loop through every ticket.
      currentTickets.map((ticket) => {

        // If this isn't the ticket we're looking for,
        // leave it unchanged.
        if (ticket.id !== ticketId) {
          return ticket;
        }

        // This is the ticket we want to update.
        return {

          // Copy all existing ticket properties.
          ...ticket,

          // Create a new items array.
          items: ticket.items.map((item) => {

            // If this isn't the item we're updating,
            // leave it unchanged.
            if (item.name !== itemName) {
              return item;
            }

            // Calculate the new quantity.
            // Prevent the quantity from going below 1.
            const newQuantity = Math.max(
              1,
              item.quantity + change
            );

            // Return a new version of the item.
            return {

              // Copy the existing item properties.
              ...item,

              // Update the quantity.
              quantity: newQuantity,

              // Recalculate the subtotal.
              subtotal:
                item.unit_price * newQuantity,
            };
          }),
        };
      })
    );
  };

  const updateTicketName = (
    ticketId: number,
    name: string
  ) => {
    setTickets((currentTickets) =>
      currentTickets.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, name }
          : ticket
      )
    );
  };

  const goToPreviousTicket = () => {
    if (currentIndex > 0) {
      setSelectedTicketId(
        visibleTickets[currentIndex - 1].id
      );
    }
  };

  const goToNextTicket = () => {
    if (currentIndex < visibleTickets.length - 1) {
      setSelectedTicketId(
        visibleTickets[currentIndex + 1].id
      );
    }
  };

  return (
    <DashboardContainer>
      <Sidebar>

        <SidebarHeader>
          <label>
            {/* add the local date and time here */}
          </label>
          <TabGroup
            tabs={[
              { id: "open", label: "Open" }, // props for the TabGroup component
              { id: "closed", label: "Closed" },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />

        </SidebarHeader>
          <TicketList>
            {visibleTickets.map((ticket) => (
              <TicketListItem
                key={ticket.id}
                id={ticket.id}
                name={ticket.name}
                total={ticket.items.reduce(
                  (sum, item) => sum + item.subtotal,
                  0
                )}
                selected={ticket.id === selectedTicketId}
                onClick={() => {
                  setSelectedTicketId(ticket.id);
                  setShowTicketDetails(true);
                }} />
            ))}
          </TicketList>

        <button>
          <Icon name="Plus" />
          New Ticket
        </button>
      </Sidebar>

      <Content $open={showTicketDetails}>
      <TicketDetails
        ticket={selectedTicket}
        onUpdateQuantity={updateItemQuantity}
        onUpdateName={updateTicketName}
        onClose={() => setShowTicketDetails(false)}
        onPrevious={goToPreviousTicket}
        onNext={goToNextTicket}
        hasPrevious={currentIndex > 0}
        hasNext={currentIndex < visibleTickets.length - 1}
      />
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

const Sidebar = styled.aside`
  display: flex;
  flex-direction: column;
  justify-content: space-between;

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
    /* background: red; */
    margin-bottom: var(--space-1);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-2);
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