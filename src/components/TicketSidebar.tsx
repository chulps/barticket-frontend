// src/components/TicketSidebar.tsx

// import react stuff
import { useEffect, useState } from "react";

// import npm packages
import styled from "styled-components";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";

// import types
import type { Ticket } from "../types/Ticket";

// import UI components
import TicketListItem from "./TicketListItem";
import TabGroup from "./TabGroup";
import Icon from "./Icon";
import { useI18n } from "../i18n";
import { resolveVisibleSelection } from "../pages/ticketBoardSelection";

import type { HTMLMotionProps } from "motion/react";
import type { TicketListMotion } from "../hooks/ticketListMotion";

/** Exiting rows are decorative immediately; they cannot reopen a moved ticket. */
function TicketRow({ children, ...props }: HTMLMotionProps<"div">) {
  const present = useIsPresent();
  return <motion.div {...props} inert={!present}>{children}</motion.div>;
}

// props
type SidebarProps = {
  ticketMotion?: TicketListMotion;
  detailsOpen?: boolean;
  activeTab: "open" | "paid" | "cancelled";
  setActiveTab: (tab: "open" | "paid" | "cancelled") => void;

  ticketsForTab: (tab: Ticket["status"]) => Ticket[];
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

  nightOpen: boolean;
  canCreate: boolean;
  createBlockedReason?: "venue-closed" | "venue-unverified" | null;
};

export default function TicketSidebar({
  ticketMotion,
  detailsOpen = false,
  activeTab,
  ticketsForTab,
  visibleTickets,
  selectedTicketId,
  lastSelectedTicket,
  setActiveTab,
  setSelectedTicketId,
  setShowTicketDetails,
  handleCreateTicket,
  getTicketTotal,
  setLastSelectedTicket,
  nightOpen,
  canCreate,
  createBlockedReason = null,
}: SidebarProps) {

  const isEditable = activeTab === "open";
  const { t, locale } = useI18n();
  const prefersReducedMotion = useReducedMotion();
  const [tabMotionSnapshot, setTabMotionSnapshot] = useState<TicketListMotion | undefined>(undefined);
  const switchedTab = tabMotionSnapshot === ticketMotion;
  const [expiredSequence, setExpiredSequence] = useState<number | null>(null);
  useEffect(() => {
    if (ticketMotion?.source !== "live") return;
    const timer = window.setTimeout(() => setExpiredSequence(ticketMotion.sequence), 500);
    return () => window.clearTimeout(timer);
  }, [ticketMotion]);
  const boardExposed = !detailsOpen || !window.matchMedia("(max-width: 768px)").matches;
  const liveMoves = !switchedTab && ticketMotion?.sequence !== expiredSequence && boardExposed && !prefersReducedMotion && document.visibilityState === "visible" && ticketMotion?.source === "live"
    ? ticketMotion.moves : [];
  const leavingIds = liveMoves.filter(move => move.from === activeTab && move.to !== activeTab).map(move => move.id);

  // setup states
  const tabOrder = ["open", "paid", "cancelled"] as const;
  const [direction, setDirection] = useState(1);

  const emptyMessages = {
    open: t("noOpenTickets"),
    paid: t("noPaidTickets"),
    cancelled: t("noCancelledTickets"),
  };

  return (
    <SidebarContainer>
      <SidebarHeader>
        <div>
          <label>{t("status")}</label>

          <TabGroup
            fitLabels
            label={t("status")}
            tabs={[
              { id: "open", label: t("open") },
              { id: "paid", label: t("paid") },
              { id: "cancelled", label: t("cancelled") },
            ]}
            activeTab={activeTab}
            onChange={(tab) => {
              const currentIndex = tabOrder.indexOf(activeTab);
              const nextIndex = tabOrder.indexOf(tab);

              setDirection(nextIndex > currentIndex ? 1 : -1);

              setTabMotionSnapshot(ticketMotion);
              setActiveTab(tab);

              const nextId = resolveVisibleSelection(ticketsForTab(tab), lastSelectedTicket[tab]);
              setSelectedTicketId(nextId ?? 0);
              if (nextId === null) setShowTicketDetails(false);
            }}
          />
        </div>
      </SidebarHeader>

      <button
        disabled={!isEditable || !canCreate}
        onClick={handleCreateTicket}
      >
        <Icon name="Plus" />
        {t("newTicket")}
      </button>
      {activeTab === "open" && !canCreate ? (
        <ClockHint>
          {createBlockedReason === "venue-closed"
            ? (locale === "ja" ? "店舗休業中は新しい伝票を作成できません。" : "New tickets are unavailable while the venue is closed.")
            : createBlockedReason === "venue-unverified"
              ? (locale === "ja" ? "店舗状態を確認できるまでPOS操作は停止しています。" : "POS actions are paused until venue status can be verified.")
              : <>{t("clockInBeforeLead")}<ProfileLink to="/profile">{t("clockInLink")}</ProfileLink>{t("clockInBeforeRest")}</>}
        </ClockHint>
      ) : null}

      <TicketList>
        <AnimatePresence key={activeTab} custom={{ leavingIds, direction }}>
        {visibleTickets.length === 0 ? (
          <EmptyTicketDetails>
            {!nightOpen && activeTab !== "open" ? t("closedNightTickets") : emptyMessages[activeTab]}
          </EmptyTicketDetails>
        ) : (
          visibleTickets.map((ticket, index) => {
            const arriving = liveMoves.some(move => move.id === ticket.id && move.to === activeTab);
            const originalEntrance = !ticketMotion || ticketMotion.source === "initial" || ticketMotion.source === "local" || switchedTab;
            const animateEntrance = !prefersReducedMotion && (originalEntrance || arriving);
            const delay = arriving ? 0 : index * 0.04;

            return (
              <TicketRow
                key={`${activeTab}-${ticket.id}`}
                data-ticket-row={ticket.id}
                data-ticket-arrival={arriving ? ticketMotion?.sequence : undefined}
                variants={{ exit: ({ leavingIds: ids, direction: d }: { leavingIds: number[]; direction: number }) =>
                  ids.includes(ticket.id)
                    ? { opacity: 0, x: -d * 24, transition: { duration: 0.18 } }
                    : { opacity: 1, x: 0, transition: { duration: 0 } } }}
                exit="exit"
                initial={animateEntrance ? { opacity: 0, x: direction * 24 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : { delay, duration: 0.18 }}
              >
              <TicketListItem
                ticketId={ticket.id}
                name={ticket.name}
                total={getTicketTotal(ticket)}
                createdAt={ticket.created_at}
                createdBy={ticket.created_by}
                selected={ticket.id === selectedTicketId}
                initial={animateEntrance ? { opacity: 0, x: -direction * 24 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={prefersReducedMotion ? { duration: 0 } : {
                  delay, type: "spring", stiffness: 500, damping: 32, mass: 0.7,
                }}
                onClick={() => {
                  setSelectedTicketId(ticket.id);

                  setLastSelectedTicket((prev) => ({
                    ...prev,
                    [activeTab]: ticket.id,
                  }));

                  setShowTicketDetails(true);
                }}
              />
              </TicketRow>
            );
          })
        )}
        </AnimatePresence>
      </TicketList>
    </SidebarContainer>
  );
}

// styling

const SidebarContainer = styled.aside`
  min-width: 0;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  gap: var(--space-2);
  padding-top: var(--space-2);

  > :not(:last-child) { flex-shrink: 0; }

  @media (min-width: 769px) {
    padding-right: var(--space-2);
  }
`;

const ClockHint = styled.p`
  color: var(--danger-400);
  font-size: 12px;
  margin: 0;
`;

const ProfileLink = styled(Link)`
  color: var(--royal-400);
  font-size: inherit;
  text-decoration: underline;
`;

const SidebarHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
`;

const TicketList = styled.div`
  min-width: 0;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  overflow: auto;
  flex: 1 1 auto;
  min-height: 100px;

  > div { min-width: 0; }
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
`;
