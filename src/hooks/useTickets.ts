// useTickets.ts
import { useState } from "react";

// import types
import type { MenuItem, Prices } from "../types/Menu";
import type { Ticket } from "../types/Ticket";
import type { PaymentType } from "../types/Ticket";

// fake ticket data just for demo
const fakeTickets: Ticket[] = [
  {
    id: 1,
    name: "John",
    status: "open",
    items: [
      {
        id: 1,
        type: "cover",
        name: "Cover Charge",
        unit_price: 500,
        quantity: 1,
        subtotal: 500,
      },
      {
        id: 2,
        type: "menu",
        menu_item_id: 2,
        name: "Asahi (330mL bottle)",
        price_key: "standard",
        unit_price: 800,
        quantity: 2,
        subtotal: 1600,
      },
      {
        id: 3,
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
    cancelled_at: null,
    payment: null,
  },

  {
    id: 2,
    name: "Sarah",
    status: "open",
    items: [
      {
        id: 1,
        type: "cover",
        name: "Cover Charge",
        unit_price: 500,
        quantity: 2,
        subtotal: 1000,
      },
      {
        id: 2,
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
    cancelled_at: null,
    payment: null,
  },

  {
    id: 3,
    name: "Walk-in",
    status: "paid",
    items: [
      {
        id: 1,
        type: "cover",
        name: "Cover Charge",
        unit_price: 500,
        quantity: 1,
        subtotal: 500,
      },
      {
        id: 2,
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
    cancelled_at: null,
    payment: {
      type: "cash", // or "card"
      paid_at: 1780993600,
      reference: "demo-001",
      refunded_at: null,
    },
  },

  {
    id: 4,
    name: "Mike",
    status: "paid",
    items: [
      {
        id: 1,
        type: "cover",
        name: "Cover Charge",
        unit_price: 500,
        quantity: 3,
        subtotal: 1500,
      },
      {
        id: 2,
        type: "menu",
        menu_item_id: 51,
        name: "Yoichi",
        price_key: "30ml",
        unit_price: 1800,
        quantity: 2,
        subtotal: 3600,
      },
      {
        id: 3,
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
    cancelled_at: null,
    payment: {
      type: "cash", // or "card"
      paid_at: 1780993600,
      reference: "demo-001",
      refunded_at: null,
    },
  },
];

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>(fakeTickets);

  // Ticket actions
  const updateTicket = (
    ticketId: number,
    updater: (ticket: Ticket) => Ticket,
  ) => {
    setTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId ? updater(ticket) : ticket,
      ),
    );
  };

  const updateItemQuantity = (
    ticketId: number,
    itemId: number,
    change: number,
  ) => {
    updateTicket(ticketId, (ticket) => ({
      ...ticket,
      updated_at: Date.now(),
      items: ticket.items.map((item) => {
        if (item.id !== itemId) return item;

        const quantity = Math.max(1, item.quantity + change);

        return {
          ...item,
          quantity,
          subtotal: item.unit_price * quantity,
        };
      }),
    }));
  };

  const updateItemPrice = (ticketId: number, itemId: number, price: number) => {
    updateTicket(ticketId, (ticket) => ({
      ...ticket,
      updated_at: Date.now(),
      items: ticket.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              unit_price: price,
              subtotal: price * item.quantity,
            }
          : item,
      ),
    }));
  };

  const addItemToTicket = (
    ticketId: number,
    menuItem: MenuItem,
    priceKey: keyof Prices,
    unitPrice: number,
  ) => {
    updateTicket(ticketId, (ticket) => ({
      ...ticket,
      updated_at: Date.now(),
      items: [
        ...ticket.items,
        {
          id: Date.now(),
          type: "menu",
          menu_item_id: menuItem.id,
          name: menuItem.name,
          price_key: priceKey,
          unit_price: unitPrice,
          quantity: 1,
          subtotal: unitPrice,
        },
      ],
    }));
  };

  const updateTicketName = (ticketId: number, name: string) => {
    updateTicket(ticketId, (ticket) => ({
      ...ticket,
      name,
      updated_at: Date.now(),
    }));
  };

  const removeItemFromTicket = (ticketId: number, itemId: number) => {
    updateTicket(ticketId, (ticket) => ({
      ...ticket,
      updated_at: Date.now(),
      items: ticket.items.filter((item) => item.id !== itemId),
    }));
  };

  const createTicket = (): Ticket => {
    const nextId =
      tickets.length > 0 ? Math.max(...tickets.map((t) => t.id)) + 1 : 1;

    const newTicket: Ticket = {
      id: nextId,
      name: "",
      status: "open",
      items: [
        {
          id: 1,
          type: "cover",
          name: "Cover Charge",
          unit_price: 500,
          quantity: 1,
          subtotal: 500,
        },
      ],
      created_at: Date.now(),
      updated_at: Date.now(),
      cancelled_at: null,
      payment: null,
    };

    setTickets((current) => [newTicket, ...current]);

    return newTicket;
  };

  const cancelTicket = (ticketId: number) => {
    setTickets((prev) =>
      prev.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, status: "cancelled" } : ticket,
      ),
    );
  };

  const payTicket = (ticketId: number, paymentType: PaymentType) => {
    setTickets((prev) =>
      prev.map((ticket) => {
        if (ticket.id !== ticketId) {
          return ticket;
        }

        const now = Math.floor(Date.now() / 1000);

        const updatedTicket = {
          ...ticket,
          status: "paid" as const,
          updated_at: now,
          payment: {
            type: paymentType,
            paid_at: now,
            reference: crypto.randomUUID(),
            refunded_at: null,
          },
        };

        console.log("PUT /api/tickets/pay", updatedTicket);

        return updatedTicket;
      }),
    );
  };

  return {
    tickets,
    setTickets, // only if you actually need it outside
    updateItemQuantity,
    updateItemPrice,
    addItemToTicket,
    updateTicketName,
    removeItemFromTicket,
    createTicket,
    cancelTicket,
    payTicket,
  };
}
