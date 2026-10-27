// useTickets.ts
import { useEffect, useRef, useState } from "react";

// import types
import type { MenuItem, Prices } from "../types/Menu";
import type { PaymentType, Ticket } from "../types/Ticket";

// import api
import { COVER_ITEM_ID, ticketsApi, toTicket, type ApiTicket } from "../api/tickets";
import { readLocale, useI18n } from "../i18n";
import { notifyMutation } from "../utils/mutationFeedback";
import { ACTIVE_REFRESH_MS, isTicketRefreshDue } from "./ticketRefreshPolicy";
import { projectTicket, type OptimisticEdit } from "./optimisticTickets";
import { acceptBackgroundSnapshot } from "./refreshSafety";
import { provisionalTicket, resolveProvisionalTicket, removeProvisionalTicket } from "./optimisticOperations";

// the name input saves on every keystroke, so wait until typing pauses
const RENAME_DELAY_MS = 500;

function reportError(error: unknown) {
  // A timed-out write may already have committed. Avoid suggesting blind retries.
  console.warn("Ticket operation could not be confirmed", error);
  notifyMutation("error", readLocale() === "ja" ? "変更を確認できませんでした。再実行する前に伝票を確認してください。" : "Ticket update not confirmed. Check the ticket before retrying.");
}

export function useTickets() {
  const { t, locale } = useI18n();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(false);

  // latest tickets for async callbacks, which would otherwise see stale state
  const ticketsRef = useRef<Ticket[]>([]);
  // one request chain per ticket so rapid clicks build on the latest server state
  const queues = useRef(new Map<number, Promise<unknown>>());
  // Terminal operations (pay/cancel/reopen) must not accept new item, name or
  // quantity writes until their server outcome has been reconciled.
  const terminalPending = useRef(new Set<number>());
  // names typed but not saved yet; server responses must not overwrite them
  const pendingNames = useRef(new Map<number, string>());
  const renameTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  // Server-confirmed data and pending projections are deliberately separate.
  const confirmed = useRef(new Map<number, Ticket>());
  const overlays = useRef(new Map<number, OptimisticEdit[]>());
  const nextKey = useRef(1);
  // Provisional IDs are fractional: backend item IDs (including negative staff-drink IDs) are integers.
  const nextTempId = useRef(-0.5);

  const project = (ticket: Ticket) => {
    const projected = projectTicket(ticket, overlays.current.get(ticket.id) ?? []);
    const pendingName = pendingNames.current.get(ticket.id);
    return pendingName === undefined ? projected : { ...projected, name: pendingName };
  };

  const display = (id: number) => {
    const base = confirmed.current.get(id);
    if (!base) return;
    const shown = project(base);
    commit(ticketsRef.current.some(ticket => ticket.id === id)
      ? ticketsRef.current.map(ticket => ticket.id === id ? shown : ticket)
      : [shown, ...ticketsRef.current]);
  };

  const addOverlay = (id: number, transform: (ticket: Ticket) => Ticket) => {
    if (!confirmed.current.has(id)) return null;
    const key = nextKey.current++;
    overlays.current.set(id, [...(overlays.current.get(id) ?? []), { key, transform }]);
    display(id);
    return key;
  };

  const dropOverlay = (id: number, key: number | null) => {
    if (key === null) return;
    const remaining = (overlays.current.get(id) ?? []).filter(op => op.key !== key);
    if (remaining.length) overlays.current.set(id, remaining);
    else overlays.current.delete(id);
  };

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
    confirmed.current.set(fromServer.id, fromServer);
    display(fromServer.id);
    return fromServer;
  };

  const enqueue = (
    ticketId: number,
    request: (current: Ticket | undefined) => Promise<ApiTicket> | null,
    transform?: (ticket: Ticket) => Ticket,
    terminalWrite = false,
  ): Promise<Ticket | null> => {
    if (terminalPending.current.has(ticketId) && !terminalWrite) {
      return Promise.resolve(null);
    }
    const key = transform ? addOverlay(ticketId, transform) : null;
    pendingWrites.current += 1;
    localRevision.current += 1;
    const previous = queues.current.get(ticketId) ?? Promise.resolve();
    const next = previous.then(async () => {
      try {
        const pending = request(confirmed.current.get(ticketId));
        if (pending === null) return null;
        const response = await pending;
        dropOverlay(ticketId, key);
        return applyServerTicket(response);
      } catch (error) {
        dropOverlay(ticketId, key);
        display(ticketId);
        reportError(error);
        // A timeout can still have committed: re-read before subsequent queued writes.
        try { applyServerTicket(await ticketsApi.get(ticketId)); }
        catch (readError) { console.warn("Ticket reconciliation failed", readError); }
        return null;
      } finally {
        dropOverlay(ticketId, key);
        display(ticketId);
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
    let initialErrorReported = false;
    let lastActivityAt = Date.now();
    let lastRefreshAt = 0;

    const refresh = async () => {
      if (cancelled || fetching || document.visibilityState === "hidden" || pendingWrites.current > 0) return;
      fetching = true;
      lastRefreshAt = Date.now();
      const revision = localRevision.current;
      try {
        const list = await ticketsApi.list();
        const loaded = acceptBackgroundSnapshot(list.map(toTicket).sort((a, b) => b.id - a.id), {
          startedRevision: revision,
          currentRevision: localRevision.current,
          pendingWrite: pendingWrites.current > 0,
          cancelled,
        });
        if (loaded === null) return;
        setTicketsError(false);
        // Never overwrite a name being edited or awaiting its debounced save.
        const next = loaded.map((ticket) => {
          const pendingName = pendingNames.current.get(ticket.id);
          return pendingName === undefined ? ticket : { ...ticket, name: pendingName };
        });
        confirmed.current = new Map(loaded.map(ticket => [ticket.id, ticket]));
        ticketsRef.current = next;
        setTickets(next);
      } catch (error) {
        if (!cancelled) {
          setTicketsError(true);
          if (!initialErrorReported) {
            initialErrorReported = true;
            reportError(error);
          } else console.warn("Unable to refresh tickets", error);
        }
      } finally {
        if (!cancelled) setTicketsLoading(false);
        fetching = false;
      }
    };

    void refresh();
    // A lightweight timer only checks whether a request is due. It does not
    // make a network request on every tick.
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (isTicketRefreshDue(now, lastActivityAt, lastRefreshAt, document.visibilityState === "visible")) {
        void refresh();
      }
    }, ACTIVE_REFRESH_MS);
    const markActivity = () => { lastActivityAt = Date.now(); };
    const onFocus = () => {
      markActivity();
      void refresh();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        markActivity();
        void refresh();
      }
    };
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", onFocus);
    window.addEventListener("barticket-push", onFocus);
    window.addEventListener("barticket-api-restored", onFocus);
    window.addEventListener("barticket-retry-tickets", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("barticket-push", onFocus);
      window.removeEventListener("barticket-api-restored", onFocus);
      window.removeEventListener("barticket-retry-tickets", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Ticket actions
  const updateItemQuantity = (
    ticketId: number,
    itemId: number,
    change: number,
  ) => {
    if (!Number.isInteger(itemId)) return; // Provisional rows must resolve before editing.
    void enqueue(ticketId, (current) => {
      const item = current?.items.find((i) => i.id === itemId);
      if (!item) return null;

      const quantity = Math.max(1, item.quantity + change);
      if (quantity === item.quantity) return null;

      return item.type === "cover"
        ? ticketsApi.setGuests(ticketId, quantity)
        : ticketsApi.updateItem(ticketId, itemId, { quantity });
    }, ticket => ({ ...ticket, items: ticket.items.map(item => {
      if (item.id !== itemId) return item;
      const quantity = Math.max(1, item.quantity + change);
      // Optimistic count changes must not temporarily re-charge waived covers.
      const waived = item.type === "cover" ? Math.min(quantity, (ticket.waivedCoverCount ?? 0) + (ticket.returningGuestCount ?? 0)) : 0;
      return { ...item, quantity, subtotal: (quantity - waived) * item.unit_price };
    }) })).then(saved => {
      if (saved) notifyMutation("success", locale === "ja" ? "数量を更新しました" : "Quantity updated");
    });
  };

  /** #91 cover changes are server-authoritative and serialized with other ticket writes. */
  const adjustCover = async (ticketId: number, adjustment: {
    returning_guest_count: number;
    waived_cover_count: number;
    returning_from_ticket_id: number | null;
    reason: string;
  }): Promise<boolean> => {
    if (!Number.isSafeInteger(ticketId) || terminalPending.current.has(ticketId)) return false;
    const current = confirmed.current.get(ticketId);
    const returning = adjustment.returning_guest_count, waived = adjustment.waived_cover_count;
    if (!current || current.status !== "open" ||
        !Number.isSafeInteger(returning) || !Number.isSafeInteger(waived) ||
        returning < 0 || waived < 0 || returning + waived > (current.guestCount ?? 0) ||
        (returning > 0) !== (adjustment.returning_from_ticket_id !== null) ||
        !adjustment.reason.trim() || adjustment.reason.trim().length > 255) return false;

    const saved = await enqueue(ticketId, () => ticketsApi.adjustCover(ticketId, adjustment));
    if (saved) notifyMutation("success", locale === "ja" ? "カバーチャージ調整を保存しました" : "Cover adjustment saved");
    return saved !== null;
  };

  const updateItemPrice = async (ticketId: number, itemId: number, price: number): Promise<boolean> => {
    if (itemId === COVER_ITEM_ID) {
      window.alert(t("coverPriceFixed"));
      return false;
    }
    if (!Number.isSafeInteger(price) || price < 0) {
      window.alert(t("priceMinimum"));
      return false;
    }
    if (!Number.isInteger(itemId)) return false;
    const saved = await enqueue(ticketId, () =>
      ticketsApi.updateItem(ticketId, itemId, { unit_price: price }),
      ticket => ({ ...ticket, items: ticket.items.map(item => item.id === itemId
        ? { ...item, unit_price: price, price_override: true, subtotal: item.quantity * price } : item) }),
    );
    if (saved) notifyMutation("success", locale === "ja" ? "価格を保存しました" : "Price saved");
    return saved !== null;
  };

  const addItemToTicket = (
    ticketId: number,
    menuItem: MenuItem,
    priceKey: keyof Prices,
    _unitPrice?: number,
    quantity = 1,
  ): Promise<boolean> => {
    if (menuItem.inStock === false || quantity < 1) return Promise.resolve(false);
    const price = menuItem.prices?.[priceKey];
    if (typeof price !== "number") return Promise.resolve(false);
    const temporaryId = nextTempId.current--;
    return enqueue(ticketId, () => ticketsApi.addItem(ticketId, menuItem.id, priceKey, quantity),
      ticket => ({ ...ticket, items: [...ticket.items, {
        id: temporaryId, type: "menu", menu_item_id: menuItem.id, price_key: priceKey,
        name: menuItem.name, unit_price: price, quantity, subtotal: price * quantity,
        price_override: false,
      }] })).then(saved => saved !== null);
  };

  const addStaffDrinkToTicket = (
    ticketId: number, staffId: number, menuItemId: number | null, priceKey: string, quantity: number,
    details?: { name: string; staffName: string; price: number },
  ): Promise<boolean> => {
    const temporaryId = nextTempId.current--;
    return enqueue(ticketId, () => ticketsApi.addStaffDrink(ticketId, staffId, menuItemId, priceKey, quantity),
      details && Number.isFinite(details.price)
        ? ticket => ({ ...ticket, items: [...ticket.items, {
            id: temporaryId, type: "menu", menu_item_id: menuItemId, price_key: priceKey,
            staff_drink: true, staff_name: details.staffName, drink_name: details.name,
            name: details.name, unit_price: details.price, quantity,
            subtotal: details.price * quantity,
          }] })
        : undefined).then(saved => saved !== null);
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
      if (saved) {
        notifyMutation("success", locale === "ja" ? "伝票名を保存しました" : "Ticket name saved");
      }
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
    if (terminalPending.current.has(ticketId)) return;
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

    if (!Number.isInteger(itemId)) return;
    void enqueue(ticketId, () => ticketsApi.removeItem(ticketId, itemId),
      ticket => ({ ...ticket, items: ticket.items.filter(item => item.id !== itemId) }))
      .then(saved => { if (saved) notifyMutation("success", locale === "ja" ? "商品を削除しました" : "Item removed"); });
  };

  // Creating a ticket is optimistic only until the server assigns an ID.
  // No item editing, payment, or other writes are allowed on temporary IDs.
  const creating = useRef(false);
  const createTicket = (): { temporaryId: number; completion: Promise<Ticket | null> } | null => {
    if (creating.current) return null; // Guard double clicks synchronously.
    creating.current = true;
    const temporaryId = nextTempId.current--;
    const now = Date.now() / 1000;
    const placeholder = provisionalTicket(temporaryId, now);

    pendingWrites.current += 1;
    commit([placeholder, ...ticketsRef.current]);
    const completion = (async (): Promise<Ticket | null> => {
      try {
        const response = await ticketsApi.create();
        // Replace the temporary row atomically, avoiding duplicate tickets.
        const saved = toTicket(response);
        notifyMutation("success", locale === "ja" ? "伝票を作成しました" : "Ticket created");
        confirmed.current.set(saved.id, saved);
        commit(resolveProvisionalTicket(ticketsRef.current, temporaryId, project(saved)));
        return saved;
      } catch (error) {
        // Remove only the temporary row; leave other tickets and navigation alone.
        commit(removeProvisionalTicket(ticketsRef.current, temporaryId));
        reportError(error);
        // An ambiguous network failure might still have created the ticket:
        // never retry POST automatically, and require user reconciliation.
        return null;
      } finally {
        creating.current = false;
        pendingWrites.current -= 1;
      }
    })();
    return { temporaryId, completion };
  };

  // Financial and terminal transitions cannot be queued twice by double taps.
  // A transport timeout may still have committed; never replay automatically.
  const terminalMutation = (
    ticketId: number,
    expected: "open" | "closed",
    request: () => Promise<Ticket | null>,
  ): Promise<Ticket | null> => {
    const status = confirmed.current.get(ticketId)?.status;
    if (!Number.isSafeInteger(ticketId) || terminalPending.current.has(ticketId) ||
        (expected === "open" ? status !== "open" : status === undefined || status === "open")) {
      return Promise.resolve(null);
    }
    // Flush the existing name first, before blocking all new edits. The
    // queued terminal write then observes the updated server state.
    flushRename(ticketId);
    terminalPending.current.add(ticketId);
    return request().finally(() => terminalPending.current.delete(ticketId));
  };

  const cancelTicket = (ticketId: number) =>
    terminalMutation(ticketId, "open", () => enqueue(ticketId, () => ticketsApi.cancel(ticketId), undefined, true))
      .then(saved => { if (saved) notifyMutation("success", locale === "ja" ? "伝票をキャンセルしました" : "Ticket cancelled"); return saved; });

  const payTicket = (ticketId: number, paymentType: PaymentType, amount?: number, idempotencyKey?: string) =>
    terminalMutation(ticketId, "open", () => enqueue(ticketId, () =>
      ticketsApi.pay(ticketId, paymentType, amount, idempotencyKey), undefined, true));

  const deferTicket = (ticketId: number, body: {
    reason: string; confirmed_balance: number; note?: string; follow_up_date?: string;
  }) => terminalMutation(ticketId, "open", () =>
    enqueue(ticketId, () => ticketsApi.deferPayment(ticketId, body), undefined, true))
      .then(saved => {
        if (saved) {
          notifyMutation("success", locale === "ja" ? "未払い残高を繰り越しました" : "Unpaid balance carried forward");
          window.dispatchEvent(new Event("barticket-retry-tickets"));
          window.dispatchEvent(new Event("barticket-shift-updated"));
        }
        return saved !== null;
      });

  const reopenTicket = (ticketId: number, reason: "customer_returned" | "closed_by_mistake" = "customer_returned") =>
    terminalMutation(ticketId, "closed", () => enqueue(ticketId, () => ticketsApi.reopen(ticketId, reason), undefined, true))
      .then(saved => { if (saved) notifyMutation("success", locale === "ja" ? "伝票を再開しました" : "Ticket reopened"); return saved; });

  return {
    tickets,
    ticketsLoading,
    ticketsError,
    updateItemQuantity,
    adjustCover,
    updateItemPrice,
    addItemToTicket,
    addStaffDrinkToTicket,
    updateTicketName,
    removeItemFromTicket,
    createTicket,
    cancelTicket,
    payTicket,
    deferTicket,
    reopenTicket,
  };
}
