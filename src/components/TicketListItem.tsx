import styled from "styled-components";

import Icon from "../components/Icon";

type TicketListItemProps = {
    id: number;
    name: string;
    total: number;
    selected?: boolean;
    onClick?: () => void;
};

export default function TicketListItem({
    id,
    name,
    total,
    selected = false,
    onClick,
}: TicketListItemProps) {
    return (
        <Container
            $selected={selected}
            onClick={onClick}
        >
            <LeftInfo>
                <TicketNumber>#{id}</TicketNumber>
                <CustomerName>{name}</CustomerName>
            </LeftInfo>

            <RightInfo>
                <RightInfoText>
                    <CreatedAt>Created (time) by (User)</CreatedAt>
                    <Total>¥{total.toLocaleString()}</Total>
                </RightInfoText>
                <Icon name="CaretRight" />
            </RightInfo>

        </Container>
    );
}

const Container = styled.button<{ $selected: boolean }>`
  width: 100%;

  display: flex;
  justify-content: space-between;
  align-items: center;

  padding: var(--space-1);

  border: 1px solid
    ${({ $selected }) =>
        $selected
            ? "var(--neutral-300)"
            : "transparent"};

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
  max-width: 6ch;
`;

const RightInfo = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-1);
`

const TicketNumber = styled.small`
  color: var(--neutral-500);
`;

const CustomerName = styled.strong``;

const Total = styled.data`
    font-weight: bold;
`;

const CreatedAt = styled.small`
    color: var(--neutral-500);
`

const RightInfoText = styled.span`
    text-align: right;
`