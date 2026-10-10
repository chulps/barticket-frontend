import { useRef, useState } from "react";
import styled from "styled-components";

import Icon from "../Icon";
import type { Ticket } from "../../types/Ticket";

type Props = {
  ticket: Ticket;
  activeTab: "open" | "paid" | "cancelled";

  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;

  hasPrevious: boolean;
  hasNext: boolean;

  onUpdateName: (ticketId: number, name: string) => void;
};

export default function TicketDetailsHeader({
  ticket,
  activeTab,
  onClose,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onUpdateName,
}: Props) {
  const [editingName, setEditingName] = useState(ticket.name === "");

  const nameInputRef = useRef<HTMLInputElement>(null);

  const createdAt = new Date(ticket.created_at * 1000);

  const isEditable = activeTab === "open";

  return (
     <Header>
                <ControlPanel>

                    <BackButton onClick={onClose}>
                        <Icon name="ArrowLeft" />
                        <BackButtonText>Back</BackButtonText>
                    </BackButton>

                    {editingName ? (
                        <NameInput
                            ref={nameInputRef}
                            autoFocus
                            type="text"
                            value={ticket.name}
                            onChange={(e) =>
                                ticket &&
                                onUpdateName(ticket.id, e.target.value)
                            }
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    setEditingName(false);
                                }
                            }}
                            onBlur={() => setEditingName(false)}
                        />
                    ) : (
                        <TicketHeader>
                            <TicketNumber>
                                Ticket #{ticket.id}
                            </TicketNumber>
                            <CustomerName
                                onClick={() => {
                                    setEditingName(true);
                                }}
                            >
                                {ticket.name || "Walk-in"}
                                <Icon
                                    className={!isEditable ? "disabled" : ""}
                                    name="PencilSimple" size={18}
                                />
                            </CustomerName>
                            <TicketCreationTime $status={ticket.status}>
                                Created at{" "}
                                {createdAt.toLocaleString("en-JP", {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                })}{" "}by Chuck
                            </TicketCreationTime>
                        </TicketHeader>
                    )}

                    <SelectorButtons>
                        <LeftButton
                            // className="small hollow secondary"
                            onClick={onPrevious}
                            disabled={!hasPrevious}
                        >
                            <Icon name="CaretLeft" />
                            <PrevButtonText>Prev</PrevButtonText>
                        </LeftButton>

                        <RightButton
                            // className="small hollow secondary"
                            onClick={onNext}
                            disabled={!hasNext}
                        >
                            <NextButtonText>Next</NextButtonText>
                            <Icon name="CaretRight" />
                        </RightButton>
                    </SelectorButtons>

                </ControlPanel>
            </Header>
  );
}

const Header = styled.header<{
    $status?: "open" | "paid" | "cancelled";
}>`
  display: flex;
  flex-direction: column;
  gap: var(--space-2);

  border-bottom: ${({ $status }) => {
        switch ($status) {
            case "open":
                return "1px solid var(neutral-800)";
            case "paid":
                return "unset";
            case "cancelled":
                return "unset";
            default:
                return "1px solid var(neutral-800)";
        }
    }};
    
  @media (min-width: 576px) {
        padding: var(--space-2) 0;
    }

    @media (min-width: 768px) {
        padding: var(--space-3) 0;
    }

    @media (min-height:600px) {
        padding: 0;
    }
`;

const TicketNumber = styled.label`
    @media (min-width: 900px) {
        justify-self: start;
    }
`;

const NameInput = styled.input`
  width: 100%;
  text-align: center;
`;

const CustomerName = styled.h4`
display: flex;
align-items: center;  
justify-self: center;
  gap: var(--space-1);

  border: none;
  background: none;

  color: inherit;
  cursor: pointer;

  &:hover {
    color: white;
  }
`;

const BackButton = styled.button`
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-0);
  min-width: unset;
  width: fit-content;
  border-radius: var(--space-1);
  background: var(--neutral-900);
  border: 1px solid var(--neutral-500);
  flex-shrink: 1;

  @media (min-width: 769px) {
    display: none;
  }
`;

const BackButtonText = styled.span`
    display: none;

    @media (min-width: 576px) {
        display: flex;
    }
`
const ControlPanel = styled.div`
    display: grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items: center;
    
    @media (min-width: 786px) {
        display: flex;
        justify-content: center;
        align-items: center;
    }
`

const SelectorButtons = styled.div`
    display: flex;
    gap: 0;
    justify-self: flex-end;

    @media (min-width: 769px) {
        display: none;
    }
`

const LeftButton = styled.button`
    border-radius: var(--space-1) 0 0 var(--space-1);
    padding: var(--space-0);
    border: 1px solid var(--neutral-500);
    background: var(--neutral-900);

    @media (min-width: 576px) {
        padding-right: var(--space-1);
    }
`

const RightButton = styled.button`
    border-radius: 0 var(--space-1) var(--space-1) 0;
    padding: var(--space-0);
    border: 1px solid var(--neutral-500);
    border-left: none;
    background: var(--neutral-900);
    
    @media (min-width: 576px) {
        padding-left: var(--space-1);
    }
`

const PrevButtonText = styled.span`
    display: none;

    @media (min-width: 576px) {
        display: flex;
    }
`

const NextButtonText = styled.span`
    display: none;

    @media (min-width: 576px) {
        display: flex;
    }
`

const TicketCreationTime = styled.small<{
    $status?: "open" | "paid" | "cancelled";
}>`
  color: ${({ $status }) => {
        switch ($status) {
            case "open":
                return "var(--royal-300)";
            case "paid":
                return "var(--success-300)";
            case "cancelled":
                return "var(--danger-300)";
            default:
                return "var(--neutral-300)";
        }
    }};
`

const TicketHeader = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;

    // @media (min-width: 768px) {
    //     display: grid;
    //     grid-template-columns: repeat(3, 1fr);
        
    // }
`