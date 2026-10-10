import styled from "styled-components";

import MenuPrice from "./MenuPrice";

import type { MenuItem } from "../types/Menu";
import { menuLabel, useI18n } from "../i18n";

type MenuItemRowProps = {
    item: MenuItem;
    onToggle?: (item: MenuItem) => void;
};

export default function MenuItemRow({
    item,
    onToggle,
}: MenuItemRowProps) {
    const { t, locale } = useI18n();
    const unavailable = item.inStock === false;

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
                <StockButton
                    type="button"
                    className="small hollow secondary"
                    onClick={() => onToggle(item)}
                >
                    {unavailable ? t("markInStock") : t("markOutOfStock")}
                </StockButton>
            ) : null}
        </MenuRow>
    );
}

const MenuRow = styled.div`
  gap: var(--space-0);
  margin-bottom: var(--space-1);
`;

const ItemInfo = styled.div`
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

const StockButton = styled.button`
  width: auto;
  margin-top: var(--space-0);
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