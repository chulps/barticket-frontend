import styled from "styled-components";

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
            <Info>
                <TicketNumber>#{id}</TicketNumber>
                <CustomerName>{name}</CustomerName>
            </Info>

            <Total>¥{total.toLocaleString()}</Total>
        </Container>
    );
}

const Container = styled.button<{ $selected: boolean }>`
  width: 100%;

  display: flex;
  justify-content: space-between;
  align-items: center;

  padding: var(--space-2);

  border: 1px solid
    ${({ $selected }) =>
        $selected
            ? "var(--accent)"
            : "var(--neutral-800)"};

  border-radius: var(--space-1);

  background: ${({ $selected }) =>
        $selected
            ? "var(--neutral-850)"
            : "transparent"};

  cursor: pointer;
  transition: 0.2s;

  &:hover {
    background: var(--neutral-900);
  }
`;

const Info = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
`;

const TicketNumber = styled.small`
  color: var(--neutral-500);
`;

const CustomerName = styled.strong``;

const Total = styled.strong``;