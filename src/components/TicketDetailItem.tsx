import styled from "styled-components";
import Icon from "../components/Icon";
import DropdownMenu from "../components/DropdownMenu";
import DropdownMenuItem from "../components/DropdownMenuItem";

type TicketDetailItemProps = {
    id: number;

    name: string;
    unitPrice: number;
    quantity: number;

    onIncrease: () => void;
    onDecrease: () => void;

    onRemove: () => void;
    onAdjustPrice: () => void;
};

export default function TicketDetailItem({
    name,
    unitPrice,
    quantity,
    onIncrease,
    onDecrease,
    onRemove,
    onAdjustPrice,
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
            <DropdownContainer>
                <DropdownMenu
                    trigger={(isOpen) => (
                        <Icon
                            name={
                                isOpen
                                    ? "X"
                                    : "DotsThreeOutlineVerticalIcon"
                            }
                        />
                    )}
                >
                    {(closeMenu) => (
                        <>
                            <DropdownMenuItem
                                onClick={() => {
                                    closeMenu();
                                    onAdjustPrice();
                                }}
                            >
                                <Icon name="CurrencyCircleDollar" />
                                Adjust Price
                            </DropdownMenuItem>

                            <DropdownMenuItem
                                danger
                                onClick={() => {
                                    closeMenu();
                                    onRemove();
                                }}
                            >
                                <Icon name="Trash" />
                                Remove Item
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenu>
            </DropdownContainer>
        </Container>
    );
}

const Container = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  align-items: center;
  gap: var(--space-2);

  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--neutral-800);
  padding: var(--space-1);
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
  justify-self: center;
`;

const QuantityButton = styled.button`
  width: var(--space-2);
  height: var(--space-2);
  padding: 0;
    background: transparent;

    &:hover {
        background: transparent;
    }
`;

const Quantity = styled.data`
  min-width: 2ch;
  text-align: center;
`;

const Subtotal = styled.data`
  min-width: 5rem;
  text-align: right;
  display: flex;
  align-items: center;
  justify-self: center;
`;

const DropdownContainer = styled.div`
    display: flex;
    justify-content: end;
`
