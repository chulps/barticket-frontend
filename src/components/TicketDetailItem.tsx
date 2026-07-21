import styled from "styled-components";
import Icon from "../components/Icon";

type TicketDetailItemProps = {
    name: string;
    unitPrice: number;
    quantity: number;

    onIncrease: () => void;
    onDecrease: () => void;
};

export default function TicketDetailItem({
    name,
    unitPrice,
    quantity,
    onIncrease,
    onDecrease,
}: TicketDetailItemProps) {
    const subtotal = unitPrice * quantity;

    return (
        <Container>
            <Info>
                <Name>{name}</Name>
                <Price>¥{unitPrice.toLocaleString()} each</Price>
            </Info>

            <Controls>
                <QuantityButton onClick={onDecrease}>
                    <Icon name="Minus" />
                </QuantityButton>

                <Quantity>{quantity}</Quantity>

                <QuantityButton onClick={onIncrease}>
                    <Icon name="Plus" />
                </QuantityButton>
            </Controls>

            <Subtotal>
                ¥{subtotal.toLocaleString()}
            </Subtotal>
        </Container>
    );
}

const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: var(--space-2);

  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--neutral-800);
`;

const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
`;

const Name = styled.p`
  font-weight: 500;
`;

const Price = styled.small`
  color: var(--neutral-400);
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: var(--space-1);
`;

const QuantityButton = styled.button`
  width: 2rem;
  height: 2rem;
  padding: 0;
`;

const Quantity = styled.span`
  min-width: 2ch;
  text-align: center;
`;

const Subtotal = styled.strong`
  min-width: 5rem;
  text-align: right;
`;