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
        <MenuRow aria-label={menuLabel(locale, item.name)}>
            <ItemInfo>
                <div>
                    <NameLine>
                        <ItemName>{menuLabel(locale, item.name)}</ItemName>
                        {unavailable ? <OutOfStock>{t("outOfStock")}</OutOfStock> : null}
                        {pending ? <Pending role="status">{locale === "ja" ? "保存中…" : "Saving…"}</Pending> : null}
                    </NameLine>
                    {item.brand || item.volume ? (
                        <Meta>
                            {[item.brand ? menuLabel(locale, item.brand) : "", item.volume ?? ""]
                                .filter(Boolean)
                                .join(" · ")}
                        </Meta>
                    ) : null}
                </div>
                <MenuPrice item={item} />
                    {item.description && (
                        <Description>{menuLabel(locale, item.description)}</Description>
                    )}
                    {item.notes && (
                        <Note>*{menuLabel(locale, item.notes)}</Note>
                    )}

            </ItemInfo>
            {onToggle && !pending ? (
                <DropdownMenu
                    label={locale === "ja" ? menuLabel(locale, item.name) + " の操作" : "Actions for " + menuLabel(locale, item.name)}
                    trigger={(isOpen) => (
                        <Icon name={isOpen ? "X" : "DotsThreeOutlineVertical"} />
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
  align-items: flex-start;
  gap: var(--space-1);
  padding: var(--space-1) 0 var(--space-2);
  border-bottom: 1px solid var(--neutral-800);
  min-width: 0;
`;

const ItemInfo = styled.div`
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--space-1) var(--space-2);
  overflow-wrap: anywhere;
`;

const NameLine = styled.div`
  display: flex;
  align-items: baseline;
  gap: var(--space-1);
  flex-wrap: wrap;
`;

const ItemName = styled.p`
  font-weight: 500;
  line-height: 1.4;
  overflow-wrap: anywhere;
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

const Description = styled.p`
  grid-column: 1 / -1;
  margin-top: 0;
  font-size: var(--font-size-p);
  line-height: 1.5;
  color: var(--neutral-300);
`;

const Note = styled.small`
  grid-column: 1 / -1;
  display: block;
  margin-top: var(--space-1);
  line-height: 1.5;
  color: var(--accent);
`;
