import styled from "styled-components";
import Icon from "../Icon";
import DropdownMenu from "../DropdownMenu";
import DropdownMenuItem from "../DropdownMenuItem";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useI18n } from "../../i18n";

type TicketDetailItemProps = {
    id: number;

    name: string;
    unitPrice: number;
    quantity: number;

    isEditingPrice: boolean;
    pending?: boolean;

    onIncrease: () => void;
    onDecrease: () => void;

    onRemove: () => void;
    onAdjustPrice: () => void;
    onSavePrice: (price: number) => Promise<boolean>;
    onCancelPrice: () => void;
    activeTab: "open" | "paid" | "cancelled";
};

export default function TicketDetailItem({
    name,
    unitPrice,
    quantity,
    isEditingPrice,
    pending = false,
    onIncrease,
    onDecrease,
    onRemove,
    onAdjustPrice,
    onSavePrice,
    onCancelPrice,
    activeTab
}: TicketDetailItemProps) {
    const { t, locale } = useI18n();
    const subtotal = unitPrice * quantity;

    const [priceInput, setPriceInput] = useState(unitPrice.toString());
    const [savingPrice, setSavingPrice] = useState(false);
    const [priceError, setPriceError] = useState("");
    const priceSavingRef = useRef(false);
    const priceTriggerRef = useRef<HTMLButtonElement>(null);
    const wasEditingPrice = useRef(false);
    useEffect(() => {
        if (wasEditingPrice.current && !isEditingPrice) priceTriggerRef.current?.focus();
        wasEditingPrice.current = isEditingPrice;
    }, [isEditingPrice]);

    const startEditingPrice = () => {
        setPriceInput(unitPrice.toString());
        setPriceError("");
        onAdjustPrice();
    };
    const savePrice = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (priceSavingRef.current || pending) return;
        if (!/^\d+$/.test(priceInput) || !Number.isSafeInteger(Number(priceInput))) {
            setPriceError(t("priceMinimum"));
            return;
        }
        const next = Number(priceInput);
        if (next === unitPrice) {
            onCancelPrice();
            return;
        }
        priceSavingRef.current = true;
        setSavingPrice(true);
        setPriceError("");
        try {
            const saved = await onSavePrice(next);
            if (!saved) setPriceError(locale === "ja"
                ? "価格を保存できませんでした。伝票を確認してください。"
                : "Price could not be confirmed. Check the ticket before retrying.");
        } catch {
            setPriceError(locale === "ja"
                ? "通信エラーが発生しました。伝票を確認してください。"
                : "Connection error. Check the ticket before retrying.");
        } finally {
            priceSavingRef.current = false;
            setSavingPrice(false);
        }
    };

    const isEditable = activeTab === "open" && !pending;

    return (
        <Container>
            <Info $editing={isEditingPrice}>
                <Name>{name}{pending ? " · Saving…" : ""}</Name>
                {isEditingPrice ? (
                    <PriceEditForm onSubmit={(event) => void savePrice(event)}>
                        <PriceInput
                            autoFocus
                            onFocus={event => event.currentTarget.select()}
                            aria-label={locale === "ja" ? name + " の新しい商品価格" : "New price for " + name}
                            type="text"
                            inputMode="numeric"
                            value={priceInput}
                            disabled={savingPrice || pending}
                            onChange={(event) => { setPriceInput(event.target.value.replace(/\D/g, "")); setPriceError(""); }}
                            onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (!savingPrice) onCancelPrice();
                                }
                            }}
                        />
                        <PriceEditActions>
                            <button type="submit" className="small" disabled={savingPrice || pending || priceInput === ""}>
                                {savingPrice ? (locale === "ja" ? "保存中…" : "Saving…") : t("save")}
                            </button>
                            <button type="button" className="small hollow secondary" disabled={savingPrice} onClick={onCancelPrice}>
                                {t("cancel")}
                            </button>
                        </PriceEditActions>
                        {priceError ? <PriceError role="alert">{priceError}</PriceError> : null}
                    </PriceEditForm>
                ) : isEditable ? (
                    <PriceTrigger type="button" ref={priceTriggerRef}
                        aria-label={locale === "ja" ? name + " の価格を調整" : "Adjust price for " + name}
                        onClick={startEditingPrice}>
                        {t("priceEach", { price: unitPrice.toLocaleString() })}
                    </PriceTrigger>
                ) : (
                    <PriceReadOnly>{t("priceEach", { price: unitPrice.toLocaleString() })}</PriceReadOnly>
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
                                    startEditingPrice();
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
  grid-template-columns: 25% 25% 25% 25%;
  align-items: center;
  column-gap: 0;

  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--neutral-800);

  &:last-of-type {
    border: none;
  }
  
  @media (min-width: 768px) {
    column-gap: 0;
    padding: var(--space-1);
  }
`;

const Info = styled.div<{ $editing: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  grid-column: ${({ $editing }) => $editing ? "1 / -1" : "auto"};
  min-width: 0;
`;

const Name = styled.p`
  margin: 0;
  font-weight: normal;
  line-height: 1.3;
  overflow-wrap: anywhere;
`;

const PriceReadOnly = styled.small`
    color: var(--neutral-400);
`;
const PriceTrigger = styled.button`
    color: var(--neutral-400);
    font-size: var(--font-size-small);
    text-align: left;
    align-self: flex-start;
    width: auto;
    min-width: 0;
    padding: 2px 0;
    border: 1px solid transparent;
    background: transparent;
    &:hover { color: white; background: transparent; }
    &:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
`;

const PriceInput = styled.input`
    width: var(--space-4);
    padding: var(--space-0);
    font-size: var(--font-size-h6);
    background: var(--neutral-800);
    border-color: var(--primary);
`;

const PriceEditForm = styled.form`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
`;
const PriceEditActions = styled.div`
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    button { width: auto; min-height: 44px; }
`;
const PriceError = styled.small`
    flex-basis: 100%;
    color: var(--danger-400);
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
    justify-self: end;
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