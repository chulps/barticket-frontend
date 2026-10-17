import styled from "styled-components";

import MenuPrice from "./MenuPrice";
import MenuPriceEditor from "./MenuPriceEditor";
import MenuItemForm from "./MenuItemForm";
import DropdownMenu from "./DropdownMenu";
import DropdownMenuItem from "./DropdownMenuItem";
import Icon from "./Icon";

import type { MenuItem, Prices } from "../types/Menu";
import { menuLabel, useI18n } from "../i18n";
import { useModal } from "../hooks/useModal";

const PRICE_KEYS = ["standard", "15ml", "30ml"] as const;

type MenuItemRowProps = {
    item: MenuItem;
    pending?: boolean;
    onToggle?: (item: MenuItem) => void;
    onSavePrices?: (item: MenuItem, prices: Prices) => Promise<void>;
    categories?: string[];
    subcategories?: string[];
};

export default function MenuItemRow({
    item,
    pending = false,
    onToggle,
    onSavePrices,
    categories = [],
    subcategories = [],
}: MenuItemRowProps) {
    const { t, locale } = useI18n();
    const { openModal } = useModal();
    const unavailable = item.inStock === false;
    const canEditPrice = PRICE_KEYS.some((key) => item.prices?.[key] !== undefined);

    function openPriceEditor() {
        if (!onSavePrices || pending) return;
        openModal({
            title: menuLabel(locale, item.name),
            maxWidth: "420px",
            fitContent: true,
            content: (
                <MenuPriceEditor
                    item={item}
                    onSave={(prices) => onSavePrices(item, prices)}
                />
            ),
        });
    }

    function openEditDraft() {
        openModal({
            title: locale === "ja" ? "商品を編集（未保存）" : "Edit item — preview only",
            maxWidth: "480px", fitContent: true,
            content: <MenuItemForm key={item.id} editingItem={item}
                categories={categories} subcategories={subcategories} />,
        });
    }

    function openArchivePreview() {
        openModal({
            title: locale === "ja" ? "メニューから削除（プレビュー）" : "Remove from menu — preview",
            maxWidth: "430px", fitContent: true,
            content: <div style={{ padding: "var(--space-2)", display: "grid", gap: "var(--space-2)" }}>
                <p><strong>{menuLabel(locale, item.name)}</strong></p>
                <p>{locale === "ja"
                    ? "削除はアーカイブ（非表示）を意味します。売上履歴・伝票の価格・明細は変更されません。在庫切れとは異なります。"
                    : "Removal will archive this item, not delete its history. Past ticket prices, sales and existing lines must remain unchanged. This differs from Out of Stock."}</p>
                <p role="status">{locale === "ja"
                    ? "アーカイブAPI（バックエンド #73）待ちです。操作はまだ実行できません。"
                    : "Awaiting backend archive API #73. Nothing will be changed."}</p>
                <button type="button" disabled>{locale === "ja" ? "アーカイブ（未対応）" : "Archive — unavailable"}</button>
            </div>,
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
                                <Icon name={unavailable ? "CheckCircle" : "Prohibit"} size="1em" />
                                {unavailable ? t("markInStock") : t("markOutOfStock")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { closeMenu(); openEditDraft(); }}>
                                <Icon name="PencilSimple" />
                                {locale === "ja" ? "商品を編集（プレビュー）" : "Edit item (preview)"}
                            </DropdownMenuItem>
                            <DropdownMenuItem danger onClick={() => { closeMenu(); openArchivePreview(); }}>
                                <Icon name="Archive" />
                                {locale === "ja" ? "メニューから削除（未対応）" : "Remove from menu (unavailable)"}
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
