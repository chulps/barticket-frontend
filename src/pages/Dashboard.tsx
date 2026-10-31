import { startBackgroundRefresh } from "../hooks/backgroundRefresh";
import { shouldPoll } from "../api/realtime";
// src/pages/Dashboard.tsx

// import react stuff
import { useEffect, useRef, useState } from "react";

// import npm packages
import styled from "styled-components";
import RequestState from "../components/RequestState";
import { Link } from "react-router-dom";

// import UI components
import TicketDetails from "../components/TicketDetails/Ticket"
import TicketSidebar from "../components/TicketSidebar";

// import types
import type { MenuData } from "../types/Menu";
import type { Ticket, PaymentType } from "../types/Ticket"

// import hooks 
import { useTickets } from "../hooks/useTickets"; // (business logic for creating or updating tickets)
import { useI18n } from "../i18n";
import { accountApi, type Account, type ShiftReport, type VenueStatus } from "../api/account";
import { getToken } from "../api/client";
import { ticketVisibleOnBoard, type ShiftLookup } from "./ticketBoardVisibility";
import { resolveVisibleSelection } from "./ticketBoardSelection";
import { businessDateJst } from "./shiftControlPolicy";

type DashboardProps = {
  menu: MenuData | null;
  loadingMenu: boolean;
  menuError: boolean;
}

// component setup
export default function Dashboard({
  menu,
  loadingMenu,
  menuError,
}: DashboardProps) {
  const { t, locale } = useI18n();

  // States
  const [activeTab, setActiveTab] = useState<"open" | "paid" | "cancelled">("open");
  const [selectedTicketId, setSelectedTicketId] = useState(1);
  const [showTicketDetails, setShowTicketDetails] = useState(false);
  // Async create callbacks must respect any navigation that happened meanwhile.
  const selectionRef = useRef(selectedTicketId);
  useEffect(() => { selectionRef.current = selectedTicketId; }, [selectedTicketId]);
  const [shiftLookup, setShiftLookup] = useState<ShiftLookup>({ status: "loading", shiftId: null });
  const [me, setMe] = useState<Account | null>(null);
  const [shift, setShift] = useState<ShiftReport | null>(null);
  const [venueStatus, setVenueStatus] = useState<VenueStatus | null>(null);
  const [currentBusinessDate, setCurrentBusinessDate] = useState("");

  // business logic for updating or creating new tickets (../hooks/useTickets.ts)
  const {
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
    reopenTicket
  } = useTickets(shiftLookup.status === "ready" ? shiftLookup.shiftId : null);

  useEffect(() => {
    let cancelled = false;
    let requestVersion = 0;
    async function load() {
      const request = ++requestVersion;
      const businessDate = businessDateJst(Date.now());
      setCurrentBusinessDate(businessDate);
      try {
        const current = await accountApi.currentShift();
        if (cancelled || request !== requestVersion) return;
        setShift(current);
        setShiftLookup({ status: "ready", shiftId: current?.id ?? null });
      } catch {
        if (cancelled || request !== requestVersion) return;
        // Unknown is never treated as "all shifts" or as an open shift.
        setShift(null);
        setShiftLookup({ status: "error", shiftId: null });
      }
      try {
        const status = await accountApi.venueStatus(businessDate);
        if (!cancelled && request === requestVersion) setVenueStatus(status);
      } catch {
        if (!cancelled && request === requestVersion) setVenueStatus(null);
      }
      if (!getToken()) {
        if (!cancelled && request === requestVersion) setMe(null);
        return;
      }
      try {
        const account = await accountApi.me();
        if (!cancelled && request === requestVersion) setMe(account);
      } catch {
        if (!cancelled && request === requestVersion) setMe(null);
      }
    }
    const stopRefresh = startBackgroundRefresh({
      refresh: load,
      shouldPoll,
      refreshKey: () => businessDateJst(Date.now()),
      events: ["barticket-auth", "barticket-users-updated", "barticket-shift-updated",
        "barticket-venue-status-updated", "barticket-retry-shift"],
    });
    return () => {
      cancelled = true;
      requestVersion++;
      stopRefresh();
    };
  }, []);

  const venueStatusKnown = venueStatus?.business_date === currentBusinessDate;
  const venueOpen = venueStatusKnown && venueStatus.status === "open";
  const canCreate = Boolean(
    me &&
    venueOpen &&
    shift?.status === "open" &&
    shift.punches.some((punch) => punch.user_id === me.id && punch.clock_out === null),
  );

  // Open tickets retain their all-shift recovery policy. Closed tickets
  // must belong to a confirmed active shift; loading/errors fail closed.
  const ticketsForTab = (tab: Ticket["status"]) => tickets.filter((ticket) =>
    ticketVisibleOnBoard(ticket, tab, shiftLookup)
  );
  const visibleTickets = ticketsForTab(activeTab);

  // Derive a valid display selection instead of updating React state in an
  // effect (which can briefly expose stale details and cascade renders).
  const visibleSelectedTicketId = resolveVisibleSelection(visibleTickets, selectedTicketId);
  // On mobile, let the ticket list reappear rather than silently changing
  // the open customer's detail pane after an incoming status/shift update.
  const showCurrentDetails = showTicketDetails && visibleSelectedTicketId === selectedTicketId;

  // answers which ticket is currently being displayed in ticket details?
  const currentIndex = visibleTickets.findIndex(
    (ticket) => ticket.id === visibleSelectedTicketId
  );

  // answers which ticket is selected in the left column
  const selectedTicket =
    visibleTickets.find((ticket) => ticket.id === visibleSelectedTicketId) ?? null;

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

  // Navigate to the provisional ticket immediately, then replace the ID on confirmation.
  // If creation fails, restore the previous selection only if it is still selected.
  const handleCreateTicket = async () => {
    const started = createTicket();
    if (!started) return; // An earlier ticket creation is still pending.
    const previousTicketId = selectedTicketId;
    const previousTab = activeTab;
    const previousDetailsVisible = showTicketDetails;

    setActiveTab("open");
    setSelectedTicketId(started.temporaryId);
    setShowTicketDetails(true);

    const confirmed = await started.completion;
    if (confirmed) {
      setSelectedTicketId(current =>
        current === started.temporaryId ? confirmed.id : current);
      return;
    }

    // Do not interrupt navigation the user performed while the request was pending.
    if (selectionRef.current !== started.temporaryId) return;
    setSelectedTicketId(previousTicketId);
    setActiveTab(previousTab);
    setShowTicketDetails(previousDetailsVisible);
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
    amount: number,
    idempotencyKey?: string,
  ) => {
    const current = tickets.find(ticket => ticket.id === ticketId);
    if (!(await payTicket(ticketId, paymentType, amount, idempotencyKey))) return false;

    const partialReceivable = current?.serviceStatus === "completed" && amount < (current.balanceDue ?? 0);
    setActiveTab(partialReceivable ? "open" : "paid");
    setSelectedTicketId(ticketId);
    setShowTicketDetails(true);
    return true;
  };

  const handleDeferTicket = async (ticketId: number, body: { reason: string; confirmed_balance: number; note?: string; follow_up_date?: string }) => {
    const saved = await deferTicket(ticketId, body);
    if (saved) {
      setActiveTab("open");
      setSelectedTicketId(ticketId);
      setShowTicketDetails(true);
    }
    return saved;
  };

  const handleReopenTicket = async (ticketId: number, reason: "customer_returned" | "closed_by_mistake"): Promise<boolean> => {
    if (!(await reopenTicket(ticketId, reason))) return false;

    setActiveTab("open");
    setSelectedTicketId(ticketId);
    setShowTicketDetails(true);
    return true;
  };

  const [lastSelectedTicket, setLastSelectedTicket] = useState<{
    open?: number;
    paid?: number;
    cancelled?: number;
  }>({});

  // messages for empty state
  const emptyMessages = {
    open: t("noOpenTickets"),
    paid: t("noPaidTickets"),
    cancelled: t("noCancelledTickets"),
  };

  if (loadingMenu) {
    return <RequestState kind="loading" detail={t("loadingMenu")} />;
  }
  if (ticketsLoading && tickets.length === 0) {
    return <RequestState kind="loading" detail={locale === "ja" ? "伝票を読み込み中…" : "Loading tickets…"} />;
  }


  return (

    <DashboardContainer>
      <ShiftStatusBar role="status" aria-live="polite">
        <span className={canCreate ? "on-duty" : ""}>
          {shiftLookup.status !== "ready" ? (locale === "ja" ? "シフトの確認が必要です" : "Shift status unverified")
            : !shift ? (locale === "ja" ? "営業中のシフトなし" : "No active shift")
            : !me ? (locale === "ja" ? "出退勤の確認が必要です" : "Check your time clock")
            : canCreate ? (locale === "ja" ? "勤務中" : "Clocked in")
            : (locale === "ja" ? "未出勤" : "Not clocked in")}
        </span>
        <Link to="/profile?section=shift">{locale === "ja" ? "タイムカードを見る" : "View time clock"}</Link>
      </ShiftStatusBar>
      {!venueStatusKnown || !venueOpen ? <TicketLoadWarning role={!venueStatusKnown ? "alert" : "status"}>
        {!venueStatusKnown
          ? (locale === "ja" ? "店舗の営業状態を確認できません。POS操作は無効です。" : "Venue status is unverified. POS actions are unavailable until it can be confirmed.")
          : (locale === "ja" ? "本日は店舗休業です。出退勤は記録できますが、店内販売はできません。" : "The venue is closed today. Staff can still clock in and out, but in-venue sales are unavailable.")}
      </TicketLoadWarning> : null}
      {shiftLookup.status === "loading" ? (
        <TicketLoadWarning role="status" aria-live="polite">
          {locale === "ja"
            ? "営業シフトを確認中です。確認が終わるまで会計済み・キャンセル済み伝票を非表示にしています。"
            : "Checking the active shift. Paid and cancelled tickets are hidden until it is confirmed."}
        </TicketLoadWarning>
      ) : shiftLookup.status === "error" ? (
        <TicketLoadWarning role="alert">
          <span>{locale === "ja"
            ? "営業シフトを確認できません。会計済み・キャンセル済み伝票は非表示です。現在営業中とは限りません。"
            : "Cannot confirm the active shift. Paid and cancelled tickets are hidden; do not assume a shift is open."}</span>
          <button type="button" className="small hollow secondary"
            onClick={() => window.dispatchEvent(new Event("barticket-retry-shift"))}>
            {locale === "ja" ? "再試行" : "Retry shift lookup"}
          </button>
        </TicketLoadWarning>
      ) : null}
      {ticketsError ? <TicketLoadWarning role="alert">
        <span>{locale === "ja"
          ? "伝票の取得に失敗しました。表示中の伝票が古い可能性があります。"
          : "Could not refresh tickets. Displayed ticket data may be outdated."}</span>
        <button type="button" className="small hollow secondary" onClick={() => window.dispatchEvent(new Event("barticket-retry-tickets"))}>
          {locale === "ja" ? "再試行" : "Retry"}
        </button>
      </TicketLoadWarning> : null}
      {menuError ? <MenuLoadWarning role="alert">
        {locale === "ja" ? "メニューを更新できません。価格と在庫を確認してください。" : "Menu is unavailable or out of date. Verify prices and stock before adding drinks."}
        <button type="button" className="small hollow secondary" onClick={() => window.dispatchEvent(new Event("barticket-retry-menu"))}>{locale === "ja" ? "再試行" : "Retry"}</button>
      </MenuLoadWarning> : null}
      <TicketSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        ticketsForTab={ticketsForTab}
        visibleTickets={visibleTickets}
        selectedTicketId={visibleSelectedTicketId ?? 0}
        setSelectedTicketId={setSelectedTicketId}
        setShowTicketDetails={setShowTicketDetails}
        handleCreateTicket={handleCreateTicket}
        getTicketTotal={getTicketTotal}
        lastSelectedTicket={lastSelectedTicket}
        setLastSelectedTicket={setLastSelectedTicket}
        nightOpen={shiftLookup.status === "ready" && shift?.status === "open"}
        canCreate={canCreate && !tickets.some(ticket => ticket.id < 0)}
        createBlockedReason={!venueStatusKnown ? "venue-unverified" : !venueOpen ? "venue-closed" : null}
      />

      <Content $open={showCurrentDetails}>
        {!venueOpen ? (
          <EmptyTicketDetails role="status" aria-live="polite">
            {venueStatusKnown
              ? (locale === "ja" ? "店舗休業中のため、POS操作は利用できません。タイムカードはプロフィールから利用できます。" : "POS actions are unavailable while the venue is closed. Time-clock controls remain available from your profile.")
              : (locale === "ja" ? "店舗の営業状態を確認するまでPOS操作は利用できません。" : "POS actions are unavailable until venue status can be verified.")}
          </EmptyTicketDetails>
        ) : selectedTicket?.id && selectedTicket.id < 0 ? (
          <EmptyTicketDetails role="status" aria-live="polite">
            {locale === "ja" ? "伝票を作成中…" : "Creating ticket…"}
          </EmptyTicketDetails>
        ) : selectedTicket ? (
          <TicketDetails
            key={selectedTicket.id}
            ticket={selectedTicket}
            menu={menu}
            tickets={tickets}
            onUpdateQuantity={updateItemQuantity}
            onAdjustCover={adjustCover}
            onUpdatePrice={updateItemPrice}
            onAddItem={addItemToTicket}
            onAddStaffDrink={addStaffDrinkToTicket}
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
            onDeferTicket={handleDeferTicket}
            onReopenTicket={handleReopenTicket}
            canCorrectPayment={me?.role === "manager"}
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
  grid-template-columns: var(--space-6) minmax(0, 1fr);
  min-width: 0;
  width: 100%;
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
    height: 100dvh;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    scroll-padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px));
    overscroll-behavior: contain;
    box-sizing: border-box;
    z-index: 1000;
    background: var(--neutral-950);
    border: none;
    padding: var(--space-2);
    padding-bottom: calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
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
const TicketLoadWarning = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2);
  border: 1px solid var(--danger-500);
  border-radius: var(--space-1);
  button { width: auto; }
`;

const MenuLoadWarning = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  border: 1px solid var(--danger-500);
  button { width: auto; }
`;

const ShiftStatusBar = styled.div`
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-1);
  flex-wrap: wrap;
  font-size: var(--font-size-small);
  color: var(--neutral-300);
  padding: 0 var(--space-1);
  .on-duty { color: var(--success-300); }
  a { color: var(--neutral-100); text-decoration: underline; text-underline-offset: 3px; }
`;

