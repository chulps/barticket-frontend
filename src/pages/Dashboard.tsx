// src/pages/Dashboard.tsx

import styled from "styled-components";
import Icon from "../components/Icon"
import TabGroup from "../components/TabGroup";
import TicketDetails from "../components/TicketDetails"
import { useState } from "react";
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
  const [tickets, setTickets] = useState(initialTickets); const [activeTab, setActiveTab] =
    useState<"open" | "closed">("open");

  const [selectedTicketId, setSelectedTicketId] =
    useState(1);

  const visibleTickets = tickets.filter(
    (ticket) => ticket.status === activeTab
  );

  const selectedTicket =
    tickets.find(
      (ticket) => ticket.id === selectedTicketId
    ) ?? null;

  const updateItemQuantity = (
    ticketId: number,
    itemName: string,
    change: number
  ) => {
    setTickets((currentTickets) =>
      currentTickets.map((ticket) => {
        if (ticket.id !== ticketId) {
          return ticket;
        }

        return {
          ...ticket,
          items: ticket.items.map((item) => {
            if (item.name !== itemName) {
              return item;
            }

            const newQuantity = Math.max(
              1,
              item.quantity + change
            );

            return {
              ...item,
              quantity: newQuantity,
              subtotal:
                item.unit_price * newQuantity,
            };
          }),
        };
      })
    );
  };

  return (
    <Container>
      <Sidebar>

        <SidebarHeader>
          <TabGroup
            tabs={[
              { id: "open", label: "Open" },
              { id: "closed", label: "Closed" },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />

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
                onClick={() => setSelectedTicketId(ticket.id)}
              />
            ))}
          </TicketList>
        </SidebarHeader>

        <button>
          <Icon name="Plus" />
          New Ticket
        </button>
      </Sidebar>

      <Content>
        <TicketDetails
          ticket={selectedTicket}
          onUpdateQuantity={updateItemQuantity}
        />      
      </Content>
    </Container>
  );
}

const Container = styled.main`
  display: grid;
  grid-template-columns: var(--space-6) 1fr;
  gap: var(--space-1);
  height: calc(100vh - var(--space-4));
  padding: var(--space-2);

  @media (max-width: 768px) {
    display: block;
  }
`;

const Sidebar = styled.aside`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-right: var(--space-1);
  @media (max-width: 768px) {
    border-right: none;
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
  overflow-y: auto;
`;

const Content = styled.section`
  border-left: 1px solid var(--neutral-800);
  padding-left: var(--space-3);

  @media (max-width: 768px) {
    display: none;
  }
`;