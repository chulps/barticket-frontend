import styled from "styled-components";

import MenuPrice from "./MenuPrice";
import MenuItemForm from "./MenuItemForm";
import MenuItemArchiveDialog from "./MenuItemArchiveDialog";
import DropdownMenu from "./DropdownMenu";
import DropdownMenuItem from "./DropdownMenuItem";
import Icon from "./Icon";

import type { MenuItem, Prices } from "../types/Menu";
import type { MenuItemEdit } from "../api/menu";
import { menuLabel, useI18n } from "../i18n";
import { useModal } from "../hooks/useModal";

type MenuItemRowProps = {
    item: MenuItem;
    pending?: boolean;
    onToggle?: (item: MenuItem) => void;
    onSavePrices?: (item: MenuItem, prices: Prices) => Promise<void>;
    onSaveItem?: (item: MenuItem, input: MenuItemEdit) => Promise<boolean>;
    onArchive?: (item: MenuItem) => Promise<boolean>;
    categories?: string[];
    subcategories?: string[];
};

export default function MenuItemRow({
    item,
    pending = false,
    onToggle,
    onSaveItem,
    onArchive,
    categories = [],
    subcategories = [],
}: MenuItemRowProps) {
    const { t, locale } = useI18n();
    const { openModal } = useModal();
    const unavailable = item.inStock === false;

    function openEdit() {
        if (!onSaveItem || pending) return;
        openModal({
            title: locale === "ja" ? "商品を編集" : "Edit menu item",
            maxWidth: "480px", fitContent: true,
            content: <MenuItemForm key={item.id} editingItem={item}
                categories={categories} subcategories={subcategories}
                onSaved={onSaveItem} />,
        });
    }

    function openArchive() {
        if (!onArchive || pending) return;
        openModal({
            title: locale === "ja" ? "商品をアーカイブ" : "Archive menu item",
            maxWidth: "430px", fitContent: true,
            content: <MenuItemArchiveDialog item={item} onArchive={onArchive} />,
        });
    }

    return (
        <MenuRow>
            <ItemInfo>
                <div>
                    <NameLine>
                        <ItemName>{menuLabel(locale, item.name)}</ItemName>
                        {unavailable ? <OutOfStock>{t("outOfStock")}</OutOfStock> : null}
                        {pending ? <Pending role="status">Saving…</Pending> : null}
                    </NameLine>
                    {item.brand || item.volume ? (
                        <Meta>
                            {[item.brand ? menuLabel(locale, item.brand) : "", item.volume ?? ""]
                                .filter(Boolean)
                                .join(" · ")}
                        </Meta>
                    ) : null}
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
            {onToggle && !pending ? (
                <DropdownMenu
                    label={locale === "ja" ? menuLabel(locale, item.name) + " の操作" : "Actions for " + menuLabel(locale, item.name)}
                    trigger={(isOpen) => (
                        <Icon name={isOpen ? "X" : "DotsThreeOutlineVerticalIcon"} />
                    )}
                >
                    {(closeMenu) => (
                        <>
                            {onSaveItem ? <DropdownMenuItem onClick={() => { closeMenu(); openEdit(); }}>
                                <Icon name="PencilSimple" />
                                {locale === "ja" ? "商品を編集" : "Edit Item"}
                            </DropdownMenuItem> : null}
                            <DropdownMenuItem
                                warning={!unavailable}
                                onClick={() => {
                                    closeMenu();
                                    onToggle(item);
                                }}
                            >
                                <Icon name={unavailable ? "CheckCircle" : "Warning"} size="1em" />
                                {unavailable ? t("markInStock") : t("markOutOfStock")}
                            </DropdownMenuItem>
                            {onArchive ? <DropdownMenuItem danger onClick={() => { closeMenu(); openArchive(); }}>
                                <Icon name="Archive" />
                                {locale === "ja" ? "商品をアーカイブ" : "Archive Item"}
                            </DropdownMenuItem> : null}

                        </>
                    )}
                </DropdownMenu>
            ) : null}
        </MenuRow>
    );
}

const MenuRow = styled.div`
  display: flex;
  align-items: center;
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

const Pending = styled.span`
  color: var(--neutral-400);
  font-size: 12px;
`;

const OutOfStock = styled.span`
  color: var(--danger-400);
  font-size: 12px;
  white-space: nowrap;
`;

const Meta = styled.small`
  display: block;
  margin-top: 0.15rem;
  color: var(--neutral-300);
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
