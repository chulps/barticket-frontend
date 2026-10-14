// src/pages/Dashboard.tsx

// import react stuff
import { useEffect, useRef, useState } from "react";

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
import { useI18n } from "../i18n";
import { accountApi, type Account, type ShiftReport } from "../api/account";
import { getToken } from "../api/client";

type DashboardProps = {
  menu: MenuData | null;
  loadingMenu: boolean;
}

// component setup
export default function Dashboard({
  menu,
  loadingMenu,
}: DashboardProps) {
  const { t } = useI18n();

  // States
  const [activeTab, setActiveTab] = useState<"open" | "paid" | "cancelled">("open");
  const [selectedTicketId, setSelectedTicketId] = useState(1);
  const [showTicketDetails, setShowTicketDetails] = useState(false);
  // Async create callbacks must respect any navigation that happened meanwhile.
  const selectionRef = useRef(selectedTicketId);
  useEffect(() => { selectionRef.current = selectedTicketId; }, [selectedTicketId]);
  const [openShiftId, setOpenShiftId] = useState<number | null | undefined>(undefined);
  const [me, setMe] = useState<Account | null>(null);
  const [shift, setShift] = useState<ShiftReport | null>(null);

  // business logic for updating or creating new tickets (../hooks/useTickets.ts)
  const {
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
    adjustCover
  } = useTickets();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const current = await accountApi.currentShift();
        if (cancelled) return;
        setShift(current);
        setOpenShiftId(current?.id ?? null);
      } catch {
        if (cancelled) return;
        setShift(null);
        setOpenShiftId(undefined);
      }
      if (!getToken()) {
        if (!cancelled) setMe(null);
        return;
      }
      try {
        const account = await accountApi.me();
        if (!cancelled) setMe(account);
      } catch {
        if (!cancelled) setMe(null);
      }
    }
    load();
    const timer = window.setInterval(load, 20000);
    window.addEventListener("focus", load);
    window.addEventListener("barticket-auth", load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      window.removeEventListener("barticket-auth", load);
    };
  }, []);

  const canCreate = Boolean(
    me &&
    shift?.status === "open" &&
    shift.punches.some((punch) => punch.user_id === me.id && punch.clock_out === null),
  );

  // Paid and cancelled tickets stay on the board only for the open shift.
  const visibleTickets = tickets.filter((ticket) => {
    if (ticket.status !== activeTab) return false;
    if (activeTab === "open" || openShiftId === undefined) return true;
    return openShiftId !== null && ticket.shiftId === openShiftId;
  });

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
  ) => {
    if (!(await payTicket(ticketId, paymentType))) return false;

    setActiveTab("paid");
    setSelectedTicketId(ticketId);
    setShowTicketDetails(true);
    return true;
  };

  const handleReopenTicket = async (ticketId: number, reason: "customer_returned" | "closed_by_mistake") => {
    if (!(await reopenTicket(ticketId, reason))) return;

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
    open: t("noOpenTickets"),
    paid: t("noPaidTickets"),
    cancelled: t("noCancelledTickets"),
  };

  if (loadingMenu) {
    return <data>{t("loadingMenu")}</data>;
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
        nightOpen={openShiftId !== null}
        canCreate={canCreate && !tickets.some(ticket => ticket.id < 0)}
      />

      <Content $open={showTicketDetails}>
        {selectedTicket?.id && selectedTicket.id < 0 ? (
          <EmptyTicketDetails role="status" aria-live="polite">Creating ticket…</EmptyTicketDetails>
        ) : selectedTicket ? (
          <TicketDetails
            key={selectedTicket.id}
            ticket={selectedTicket}
            menu={menu}
            tickets={tickets}
            onUpdateQuantity={updateItemQuantity}
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
            onReopenTicket={handleReopenTicket}
            onAdjustCover={adjustCover}
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