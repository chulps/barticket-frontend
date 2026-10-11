import styled from "styled-components";
import Icon from "../Icon";
import DropdownMenu from "../DropdownMenu";
import DropdownMenuItem from "../DropdownMenuItem";
import { useState } from "react";
import { useI18n } from "../../i18n";

type TicketDetailItemProps = {
    id: number;

    name: string;
    unitPrice: number;
    quantity: number;

    isEditingPrice: boolean;

    onIncrease: () => void;
    onDecrease: () => void;

    onRemove: () => void;
    onAdjustPrice: () => void;
    onSavePrice: (price: number) => void;
    activeTab: "open" | "paid" | "cancelled";
};

export default function TicketDetailItem({
    name,
    unitPrice,
    quantity,
    isEditingPrice,
    onIncrease,
    onDecrease,
    onRemove,
    onAdjustPrice,
    onSavePrice,
    activeTab
}: TicketDetailItemProps) {
    const { t } = useI18n();
    const subtotal = unitPrice * quantity;

    const [priceInput, setPriceInput] = useState(unitPrice.toString());

    const isEditable = activeTab === "open";

    return (
        <Container>
            <Info>
                <Name>{name}</Name>
                {isEditingPrice ? (
                    <PriceInput
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        value={priceInput}
                        onChange={(e) =>
                            setPriceInput(
                                e.target.value.replace(/\D/g, "")
                            )
                        }
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                onSavePrice(Number(priceInput));
                            }

                            if (e.key === "Escape") {
                                onSavePrice(unitPrice);
                            }
                        }}
                    />
                ) : (
                    <Price
                        onClick={() => {
                            setPriceInput(unitPrice.toString());
                            onAdjustPrice();
                        }}
                    >
                        {t("priceEach", { price: unitPrice.toLocaleString() })}
                    </Price>
                )}
            </Info>

            <Controls>
                <QuantityButton 
                    disabled={!isEditable}
                    onClick={onIncrease}>
                    <PlusWrapper>
                        <Icon name="Plus" />
                    </PlusWrapper>

                    <UpCaretWrapper>
                        <Icon name="CaretUp" />
                    </UpCaretWrapper>
                </QuantityButton>

                <Quantity>{quantity}</Quantity>

                <QuantityButton 
                    disabled={!isEditable}
                    onClick={onDecrease}>

                    <MinusWrapper>
                        <Icon name="Minus" />
                    </MinusWrapper>

                    <DownCaretWrapper>
                        <Icon name="CaretDown" />
                    </DownCaretWrapper>
                </QuantityButton>

            </Controls>

            <Subtotal>
                ¥{subtotal.toLocaleString()}
            </Subtotal>

            <DropdownContainer>
                <DropdownMenu
                    disabled={!isEditable}
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
                                {t("adjustPrice")}
                            </DropdownMenuItem>

                            <DropdownMenuItem
                                danger
                                onClick={() => {
                                    closeMenu();
                                    onRemove();
                                }}
                            >
                                <Icon name="Trash" />
                                {t("removeItem")}
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
  grid-template-columns: minmax(0, 1fr) 3rem 4.5rem 2.75rem;
  align-items: center;
  gap: var(--space-1);

  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--neutral-800);

  &:last-of-type {
    border: none;
  }
  
  @media (min-width: 768px) {
        grid-template-columns: minmax(0, 1fr) 5.5rem 5rem 7.5rem;
    gap: var(--space-2);
    padding: var(--space-1);
  }
`;

const Info = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
`;

const Name = styled.p`
  margin: 0;
  font-weight: normal;
  line-height: 1.3;
`;

const Price = styled.small`
    color: var(--neutral-400);
    cursor: pointer;

    &:hover {
        color: white;
    }
`;

const PriceInput = styled.input`
    width: var(--space-4);
    padding: var(--space-0);
    font-size: var(--font-size-h6);
    background: var(--neutral-800);
    border-color: var(--primary);
`;

const Controls = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  justify-self: center;

  @media (min-width: 576px) {
    flex-direction: row-reverse;
  }
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

const UpCaretWrapper = styled.span`
    display: block;

    @media (min-width: 576px) {
        display: none;
    }
`

const PlusWrapper = styled.span `
    display: none;

    @media (min-width: 576px) {
        display: block;
    }
`

const DownCaretWrapper = styled.span`
    display: block;

    @media (min-width: 576px) {
        display: none;
    }
`

const MinusWrapper = styled.span `
    display: none;

    @media (min-width: 576px) {
        display: block;
    }
`