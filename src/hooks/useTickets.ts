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
const TICKET_REFRESH_MS = 5000;

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
  // Protect local writes and in-flight edits from stale background snapshots.
  const pendingWrites = useRef(0);
  const localRevision = useRef(0);

  const commit = (next: Ticket[]) => {
    localRevision.current += 1;
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
    pendingWrites.current += 1;
    localRevision.current += 1;
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
    const settled = next.finally(() => {
      pendingWrites.current -= 1;
    });
    queues.current.set(ticketId, settled);
    return settled;
  };

  // Refresh from the existing REST endpoint so other devices' changes appear
  // without a backend subscription or WebSocket connection.
  useEffect(() => {
    let cancelled = false;
    let fetching = false;
    let loadedOnce = false;

    const refresh = async () => {
      if (cancelled || fetching || document.visibilityState === "hidden" || pendingWrites.current > 0) return;
      fetching = true;
      const revision = localRevision.current;
      try {
        const list = await ticketsApi.list();
        if (cancelled || pendingWrites.current > 0 || revision !== localRevision.current) return;
        const loaded = list.map(toTicket).sort((a, b) => b.id - a.id);
        // Never overwrite a name being edited or awaiting its debounced save.
        const next = loaded.map((ticket) => {
          const pendingName = pendingNames.current.get(ticket.id);
          return pendingName === undefined ? ticket : { ...ticket, name: pendingName };
        });
        ticketsRef.current = next;
        setTickets(next);
        loadedOnce = true;
      } catch (error) {
        if (!cancelled) {
          if (!loadedOnce) reportError(error);
          else console.warn("Unable to refresh tickets", error);
        }
      } finally {
        fetching = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), TICKET_REFRESH_MS);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
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

  const addStaffDrinkToTicket = (
    ticketId: number, staffId: number, menuItemId: number | null, priceKey: string, quantity: number,
  ) => {
    void enqueue(ticketId, () => ticketsApi.addStaffDrink(ticketId, staffId, menuItemId, priceKey, quantity));
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

  const reopenTicket = (ticketId: number) => {
    flushRename(ticketId);
    return enqueue(ticketId, () => ticketsApi.reopen(ticketId));
  };

  return {
    tickets,
    updateItemQuantity,
    updateItemPrice,
    addItemToTicket,
    addStaffDrinkToTicket,
    updateTicketName,
    removeItemFromTicket,
    createTicket,
    cancelTicket,
    payTicket,
    reopenTicket,
  };
}
