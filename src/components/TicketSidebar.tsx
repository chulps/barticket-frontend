// src/components/TicketSidebar.tsx

// import react stuff
import { useState } from "react";

// import npm packages
import styled from "styled-components";
import { motion } from "motion/react"

// import types
import type { Ticket } from "../types/Ticket";

// import UI components
import TicketListItem from "./TicketListItem";
import TabGroup from "./TabGroup";
import Icon from "./Icon";
import { useI18n } from "../i18n";

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

  nightOpen: boolean;
  canCreate: boolean;
};

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
  nightOpen,
  canCreate,
}: SidebarProps) {

  const isEditable = activeTab === "open";
  const { t } = useI18n();

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
        <ClockHint>{t("clockInBeforeTickets")}</ClockHint>
      ) : null}

      <TicketList>
        {visibleTickets.length === 0 ? (
          <EmptyTicketDetails>
            {!nightOpen && activeTab !== "open" ? t("closedNightTickets") : emptyMessages[activeTab]}
          </EmptyTicketDetails>
        ) : (
          visibleTickets.map((ticket, index) => (
            <motion.div
              key={`${activeTab}-${ticket.id}`}
              initial={{
                opacity: 0,
                x: direction * 24,
              }}
              animate={{
                opacity: 1,
                x: 0,
              }}
              transition={{
                delay: index * 0.04,
                duration: 0.18,
              }}
            >
              <TicketListItem
                key={`${activeTab}-${ticket.id}`}
                ticketId={ticket.id}
                name={ticket.name}
                total={getTicketTotal(ticket)}
                createdAt={ticket.created_at}
                createdBy={ticket.created_by}
                selected={ticket.id === selectedTicketId}

                initial={{
                  opacity: 0,
                  x: -direction * 24,
                }}

                animate={{
                  opacity: 1,
                  x: 0,
                }}

                transition={{
                  delay: index * 0.04,
                  type: "spring",
                  stiffness: 500,
                  damping: 32,
                  mass: 0.7,
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
            </motion.div>
          ))
        )}
      </TicketList>
    </SidebarContainer>
  );
}

// styling

const SidebarContainer = styled.aside`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-2);
  padding-top: var(--space-2);

  @media (min-width: 768px) {
    padding-right: var(--space-2);
    height: calc(100vh - 100px);
  }
`;

const ClockHint = styled.p`
  color: var(--neutral-400);
  font-size: 12px;
  margin: 0;
`;

const SidebarHeader = styled.div`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
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
`;