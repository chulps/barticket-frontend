// useTickets.ts
import { useEffect, useRef, useState } from "react";

// import types
import type { MenuItem, Prices } from "../types/Menu";
import type { PaymentType, Ticket } from "../types/Ticket";

// import api
import { COVER_ITEM_ID, ticketsApi, toTicket, type ApiTicket } from "../api/tickets";
import { useI18n } from "../i18n";

// the name input saves on every keystroke, so wait until typing pauses
const RENAME_DELAY_MS = 500;

function reportError(error: unknown) {
  console.error(error);
  window.alert(error instanceof Error ? error.message : String(error));
}

export function useTickets() {
  const { t } = useI18n();
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // latest tickets for async callbacks, which would otherwise see stale state
  const ticketsRef = useRef<Ticket[]>([]);
  // one request chain per ticket so rapid clicks build on the latest server state
  const queues = useRef(new Map<number, Promise<unknown>>());
  // names typed but not saved yet; server responses must not overwrite them
  const pendingNames = useRef(new Map<number, string>());
  const renameTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const commit = (next: Ticket[]) => {
    ticketsRef.current = next;
    setTickets(next);
  };

  const applyServerTicket = (api: ApiTicket): Ticket => {
    const fromServer = toTicket(api);
    const pendingName = pendingNames.current.get(fromServer.id);
    const ticket =
      pendingName === undefined ? fromServer : { ...fromServer, name: pendingName };
    const current = ticketsRef.current;
    commit(
      current.some((t) => t.id === ticket.id)
        ? current.map((t) => (t.id === ticket.id ? ticket : t))
        : [ticket, ...current],
    );
    return ticket;
  };

  const enqueue = (
    ticketId: number,
    request: (current: Ticket | undefined) => Promise<ApiTicket> | null,
  ): Promise<Ticket | null> => {
    const previous = queues.current.get(ticketId) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        const pending = request(ticketsRef.current.find((t) => t.id === ticketId));
        return pending === null ? null : applyServerTicket(await pending);
      } catch (error) {
        reportError(error);
        return null;
      }
    });
    queues.current.set(ticketId, next);
    return next;
  };

  // Load tickets from the backend
  useEffect(() => {
    ticketsApi
      .list()
      .then((list) => {
        const loaded = list.map(toTicket).sort((a, b) => b.id - a.id);
        ticketsRef.current = loaded;
        setTickets(loaded);
      })
      .catch(reportError);
  }, []);

  // Ticket actions
  const updateItemQuantity = (
    ticketId: number,
    itemId: number,
    change: number,
  ) => {
    void enqueue(ticketId, (current) => {
      const item = current?.items.find((i) => i.id === itemId);
      if (!item) return null;

      const quantity = Math.max(1, item.quantity + change);
      if (quantity === item.quantity) return null;

      return item.type === "cover"
        ? ticketsApi.setGuests(ticketId, quantity)
        : ticketsApi.updateItem(ticketId, itemId, { quantity });
    });
  };

  const updateItemPrice = (ticketId: number, itemId: number, price: number) => {
    if (itemId === COVER_ITEM_ID) {
      window.alert(t("coverPriceFixed"));
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      window.alert(t("priceMinimum"));
      return;
    }

    void enqueue(ticketId, () =>
      ticketsApi.updateItem(ticketId, itemId, { unit_price: Math.round(price) }),
    );
  };

  const addItemToTicket = (
    ticketId: number,
    menuItem: MenuItem,
    priceKey: keyof Prices,
  ) => {
    void enqueue(ticketId, () => ticketsApi.addItem(ticketId, menuItem.id, priceKey));
  };

  const flushRename = (ticketId: number) => {
    const timer = renameTimers.current.get(ticketId);
    if (timer === undefined) return;

    clearTimeout(timer);
    renameTimers.current.delete(ticketId);
    saveName(ticketId);
  };

  const saveName = (ticketId: number) => {
    const name = pendingNames.current.get(ticketId);
    if (name === undefined) return;

    void enqueue(ticketId, () => ticketsApi.rename(ticketId, name)).then(async (saved) => {
      if (pendingNames.current.get(ticketId) !== name) return;

      pendingNames.current.delete(ticketId);
      if (saved === null) {
        // Save failed: show the name the backend actually has.
        try {
          applyServerTicket(await ticketsApi.get(ticketId));
        } catch (error) {
          reportError(error);
        }
      }
    });
  };

  const updateTicketName = (ticketId: number, name: string) => {
    pendingNames.current.set(ticketId, name);
    commit(
      ticketsRef.current.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, name } : ticket,
      ),
    );

    clearTimeout(renameTimers.current.get(ticketId));
    renameTimers.current.set(
      ticketId,
      setTimeout(() => {
        renameTimers.current.delete(ticketId);
        saveName(ticketId);
      }, RENAME_DELAY_MS),
    );
  };

  const removeItemFromTicket = (ticketId: number, itemId: number) => {
    if (itemId === COVER_ITEM_ID) {
      window.alert(t("coverCannotRemove"));
      return;
    }

    void enqueue(ticketId, () => ticketsApi.removeItem(ticketId, itemId));
  };

  const createTicket = async (): Promise<Ticket | null> => {
    try {
      return applyServerTicket(await ticketsApi.create());
    } catch (error) {
      reportError(error);
      return null;
    }
  };

  const cancelTicket = (ticketId: number) => {
    flushRename(ticketId);
    return enqueue(ticketId, () => ticketsApi.cancel(ticketId));
  };

  const payTicket = (ticketId: number, paymentType: PaymentType) => {
    flushRename(ticketId);
    return enqueue(ticketId, () => ticketsApi.pay(ticketId, paymentType));
  };

  const reopenTicket = async (ticketId: number): Promise<Ticket | null> => {
    console.warn(`Reopen ticket ${ticketId}: not supported by the API yet`);
    window.alert(t("reopenUnsupported"));
    return null;
  };

  return {
    tickets,
    updateItemQuantity,
    updateItemPrice,
    addItemToTicket,
    updateTicketName,
    removeItemFromTicket,
    createTicket,
    cancelTicket,
    payTicket,
    reopenTicket,
  };
}
