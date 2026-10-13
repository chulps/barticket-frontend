// TicketListItem.tsx

// npm packages
import styled from "styled-components";
import { motion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";


// UI components
import Icon from "../components/Icon";
import { localeTag, useI18n } from "../i18n";

type TicketListItemProps = HTMLMotionProps<"button"> & {
    ticketId: number;
    name: string;
    total: number;
    createdAt?: number;
    createdBy?: string | null;
    selected?: boolean;
    onClick?: () => void;
};

export default function TicketListItem({
    ticketId,
    name,
    total,
    createdAt,
    createdBy,
    selected = false,
    onClick,
    ...motionProps
}: TicketListItemProps) {
    const { t, locale } = useI18n();
    return (
        <Container
            $selected={selected}
            onClick={onClick}
            {...motionProps}
        >
            <LeftInfo>
                <TicketNumber>#{ticketId}</TicketNumber>
                <CustomerName>{name}</CustomerName>
            </LeftInfo>

            <RightInfo>
                <RightInfoText>
                    <CreatedAt title={createdBy ?? undefined}>
                        {createdAt
                            ? new Date(createdAt * 1000).toLocaleString(localeTag(locale), {
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                              })
                            : t("created")}
                        {createdBy ? ` ${t("byName", { name: createdBy })}` : ""}
                    </CreatedAt>
                    <Total>¥{total.toLocaleString()}</Total>
                </RightInfoText>
                <Icon name="CaretRight" />
            </RightInfo>

        </Container>
    );
}

const Container = styled(motion.button) <{ $selected: boolean }>`  
  width: 100%;
  min-width: 0;

  display: flex;
  justify-content: space-between;
  align-items: center;

  padding: var(--space-1);

  border: 1px solid ${({ $selected }) => $selected ? "var(--neutral-300)" : "transparent"};

    box-shadow: ${({ $selected }) => $selected ? "inset -4px 0 0 var(--neutral-400)" : "none"};

  border-radius: var(--space-1);

  background: ${({ $selected }) =>
        $selected
            ? "var(--neutral-800)"
            : "var(--neutral-900)"};

  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: var(--neutral-700);
  }
`;

const LeftInfo = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  max-width: 45%;
  flex: 0 1 auto;
`;

const RightInfo = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    flex: 1 1 0;
    justify-content: flex-end;

    > svg { flex-shrink: 0; }
`

const TicketNumber = styled.small`
  color: var(--neutral-500);
`;

const CustomerName = styled.strong`
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const Total = styled.data`
    font-weight: bold;
`;

const CreatedAt = styled.small`
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--neutral-500);
`

const RightInfoText = styled.span`
    display: block;
    min-width: 0;
    flex: 1 1 0;
    text-align: right;
`