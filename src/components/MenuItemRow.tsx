import styled from "styled-components";

import MenuPrice from "./MenuPrice";
import MenuPriceEditor from "./MenuPriceEditor";
import DropdownMenu from "./DropdownMenu";
import DropdownMenuItem from "./DropdownMenuItem";
import Icon from "./Icon";

import type { MenuItem, Prices } from "../types/Menu";
import { menuLabel, useI18n } from "../i18n";
import { useModal } from "../hooks/useModal";

const PRICE_KEYS = ["standard", "15ml", "30ml"] as const;

type MenuItemRowProps = {
    item: MenuItem;
    onToggle?: (item: MenuItem) => void;
    onSavePrices?: (item: MenuItem, prices: Prices) => Promise<void>;
};

export default function MenuItemRow({
    item,
    onToggle,
    onSavePrices,
}: MenuItemRowProps) {
    const { t, locale } = useI18n();
    const { openModal } = useModal();
    const unavailable = item.inStock === false;
    const canEditPrice = PRICE_KEYS.some((key) => item.prices?.[key] !== undefined);

    function openPriceEditor() {
        if (!onSavePrices) return;
        openModal({
            title: menuLabel(locale, item.name),
            maxWidth: "420px",
            content: (
                <MenuPriceEditor
                    item={item}
                    onSave={(prices) => onSavePrices(item, prices)}
                />
            ),
        });
    }

    return (
        <MenuRow>
            <ItemInfo>
                <div>
                    <NameLine>
                        <ItemName>{menuLabel(locale, item.name)}</ItemName>
                        {unavailable ? <OutOfStock>{t("outOfStock")}</OutOfStock> : null}
                    </NameLine>
                    {item.description && (
                        <Description>{menuLabel(locale, item.description)}</Description>
                    )}
                    {item.notes && (
                        <Note>*{menuLabel(locale, item.notes)}</Note>
                    )}
                </div>
                <Spacer />
                <MenuPrice item={item} />
            </ItemInfo>
            {onToggle ? (
                <DropdownMenu
                    trigger={(isOpen) => (
                        <Icon name={isOpen ? "X" : "DotsThreeOutlineVerticalIcon"} />
                    )}
                >
                    {(closeMenu) => (
                        <>
                            <DropdownMenuItem
                                danger={!unavailable}
                                onClick={() => {
                                    closeMenu();
                                    onToggle(item);
                                }}
                            >
                                <Icon name={unavailable ? "CheckCircle" : "Prohibit"} />
                                {unavailable ? t("markInStock") : t("markOutOfStock")}
                            </DropdownMenuItem>
                            {canEditPrice && onSavePrices ? (
                                <DropdownMenuItem
                                    onClick={() => {
                                        closeMenu();
                                        openPriceEditor();
                                    }}
                                >
                                    <Icon name="CurrencyCircleDollar" />
                                    {t("adjustPrice")}
                                </DropdownMenuItem>
                            ) : null}
                        </>
                    )}
                </DropdownMenu>
            ) : null}
        </MenuRow>
    );
}

const MenuRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--space-1);
  margin-bottom: var(--space-1);
`;

const ItemInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: end;
  gap: var(--space-1);
`;

const NameLine = styled.div`
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  flex-wrap: wrap;
`;

const ItemName = styled.p`
  font-weight: 300;
`;

const OutOfStock = styled.span`
  color: var(--danger-400);
  font-size: 12px;
  white-space: nowrap;
`;

const Description = styled.small`
  margin-top: 0.15rem;
  line-height: 1.3;
  color: var(--neutral-400);
`;

const Note = styled.small`
  margin-left: 0.4rem;
  color: var(--accent);
`;

const Spacer = styled.div`
  flex: 1;
  align-self: flex-end;
  border-bottom: 1px dashed var(--neutral-700);
`;
