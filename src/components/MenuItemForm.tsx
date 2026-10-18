import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import styled from "styled-components";

import type { MenuItem, Prices } from "../types/Menu";
import { useI18n } from "../i18n";
import { useModal } from "../hooks/useModal";
import { createMenuItem, type NewMenuItem } from "../api/menu";
import { ApiError } from "../api/client";
import { notifyMutation } from "../utils/mutationFeedback";

const PRICE_KEYS = ["standard", "15ml", "30ml"] as const;

type MenuItemFormProps = {
    categories: string[];
    subcategories: string[];
    onCreated?: (item: Awaited<ReturnType<typeof createMenuItem>>) => void;
    editingItem?: MenuItem;
    onSaved?: (item: MenuItem, input: NewMenuItem) => Promise<boolean>;
};

export default function MenuItemForm({
    categories,
    subcategories,
    onCreated,
    editingItem,
    onSaved,
}: MenuItemFormProps) {
    const { t, locale } = useI18n();
    const id = useId().replace(/:/g, "");
    const help = (en: string, jp: string) => locale === "ja" ? jp : en;
    const { closeModal, forceCloseModal, registerCloseGuard } = useModal();
    const dirty = useRef(false);
    const pending = useRef(false);
    useEffect(() => {
        registerCloseGuard(() => !pending.current && (!dirty.current || window.confirm(locale === "ja"
            ? "保存していない変更を破棄しますか？" : "Discard unsaved changes?")));
        return () => registerCloseGuard(null);
    }, [locale, registerCloseGuard]);
    const [name, setName] = useState(editingItem?.name ?? "");
    const [categoryChoice, setCategoryChoice] = useState(editingItem?.category ?? "");
    const [customCategory, setCustomCategory] = useState("");
    const [subcategoryChoice, setSubcategoryChoice] = useState(editingItem?.subcategory ?? "");
    const [customSubcategory, setCustomSubcategory] = useState("");
    const category = categoryChoice === "__new__" ? customCategory : categoryChoice;
    const subcategory = subcategoryChoice === "__new__" ? customSubcategory : subcategoryChoice;
    const isBeer = category.trim().toLowerCase() === "beer";
    const [brand, setBrand] = useState(editingItem?.brand ?? "");
    const [volume, setVolume] = useState(editingItem?.volume ?? "");
    const [description, setDescription] = useState(editingItem?.description ?? "");
    const [notes, setNotes] = useState(editingItem?.notes ?? "");
    const [tags, setTags] = useState<string[]>(editingItem?.tags ?? []);
    const [tagDraft, setTagDraft] = useState("");
    const [prices, setPrices] = useState<Record<string, string>>({
        standard: editingItem?.prices?.standard === undefined ? "" : String(editingItem.prices.standard),
        "15ml": editingItem?.prices?.["15ml"] === undefined ? "" : String(editingItem.prices["15ml"]),
        "30ml": editingItem?.prices?.["30ml"] === undefined ? "" : String(editingItem.prices["30ml"]),
    });
    const [inStock, setInStock] = useState(editingItem?.inStock !== false);
    const [cocktailIngredient, setCocktailIngredient] = useState(editingItem?.cocktailIngredient === true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function addTag() {
        dirty.current = true;
        const next = tagDraft.trim();
        if (!next || tags.includes(next)) {
            setTagDraft("");
            return;
        }
        setTags((current) => [...current, next]);
        setTagDraft("");
    }

    async function save(event: FormEvent) {
        event.preventDefault();
        if (pending.current) return;
        const trimmedName = name.trim();
        const trimmedCategory = category.trim();
        if (!trimmedName) {
            setError(t("menuItemNameRequired"));
            return;
        }
        if (!trimmedCategory) {
            setError(t("menuItemCategoryRequired"));
            return;
        }
        const nextTags = [...tags];
        const draft = tagDraft.trim();
        if (draft && !nextTags.includes(draft)) nextTags.push(draft);
        const nextPrices: Prices = {};
        for (const key of PRICE_KEYS) {
            const raw = prices[key] ?? "";
            if (raw === "") continue;
            const amount = Number(raw);
            if (!/^\d+$/.test(raw) || !Number.isSafeInteger(amount) || amount < 0) {
                setError(t("priceMinimum"));
                return;
            }
            nextPrices[key] = amount;
        }
        if (!cocktailIngredient && nextPrices.standard === undefined && (nextPrices["15ml"] === undefined || nextPrices["30ml"] === undefined)) {
            setError(help("Enter a standard price, or both 15ml and 30ml prices.", "通常価格、または15mlと30mlの両方の価格を入力してください。"));
            return;
        }
        setError("");
        pending.current = true;
        setSaving(true);
        try {
            const input: NewMenuItem = {
                name: trimmedName,
                category: trimmedCategory,
                subcategory: subcategory.trim() || undefined,
                description: description.trim() || undefined,
                notes: notes.trim() || undefined,
                brand: brand.trim() || undefined,
                volume: isBeer ? volume.trim() || undefined : undefined,
                tags: nextTags,
                prices: nextPrices,
                in_stock: inStock,
                cocktail_ingredient: cocktailIngredient,
            };
            if (editingItem) {
                if (!onSaved || !(await onSaved(editingItem, input))) {
                    throw new Error("Edit not confirmed. Please reload the menu before trying again.");
                }
                notifyMutation("success", locale === "ja" ? "商品情報を保存しました" : "Menu item saved");
            } else {
                const created = await createMenuItem(input);
                onCreated?.({ ...created, prices: created.prices ?? {} });
                notifyMutation("success", locale === "ja" ? "メニューに商品を追加しました" : "Item added to menu");
            }
            dirty.current = false;
            forceCloseModal();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message :
                caught instanceof Error ? caught.message : t("addMenuItemFailed"));
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }



    return (
        <Form onSubmit={save} onChangeCapture={() => { dirty.current = true; }}>
            <Field>
                <Caption htmlFor={id + "-name"}>{t("name")} *</Caption>
                <TextInput id={id + "-name"} value={name} onChange={(e) => setName(e.target.value)}
                    placeholder={help("e.g. Nikka From the Barrel", "例：ニッカ フロム・ザ・バレル")} required />
                <Hint>{help("The name staff and customers see on the menu.", "スタッフとお客様に表示される商品名です。")}</Hint>
            </Field>
            <Field>
                <Caption htmlFor={id + "-category"}>{t("category")} *</Caption>
                <SelectWrap>
                    <SelectInput id={id + "-category"} value={categoryChoice}
                        onChange={(e) => { setCategoryChoice(e.target.value); setSubcategoryChoice(""); setCustomSubcategory(""); }}>
                        <option value="">{help("Choose a category", "カテゴリーを選択")}</option>
                        {Array.from(new Set(categories)).filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}
                        <option value="__new__">{help("+ New category…", "＋新しいカテゴリー…")}</option>
                    </SelectInput>
                    <Caret aria-hidden="true">⌄</Caret>
                </SelectWrap>
                {categoryChoice === "__new__" ? <TextInput aria-label={help("New category", "新しいカテゴリー")}
                    value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder={help("e.g. Whisky", "例：ウイスキー")} /> : null}
                <Hint>{help("The main menu section where this drink belongs.", "ドリンクが属するメニューの大分類です。")}</Hint>
            </Field>
            <Field>
                <Caption htmlFor={id + "-subcategory"}>{t("subcategory")}</Caption>
                <SelectWrap>
                    <SelectInput id={id + "-subcategory"} value={subcategoryChoice}
                        onChange={(e) => setSubcategoryChoice(e.target.value)}>
                        <option value="">{help("None / Choose a subcategory", "なし／サブカテゴリーを選択")}</option>
                        {Array.from(new Set(subcategories)).filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}
                        <option value="__new__">{help("+ New subcategory…", "＋新しいサブカテゴリー…")}</option>
                    </SelectInput>
                    <Caret aria-hidden="true">⌄</Caret>
                </SelectWrap>
                {subcategoryChoice === "__new__" ? <TextInput aria-label={help("New subcategory", "新しいサブカテゴリー")}
                    value={customSubcategory} onChange={(e) => setCustomSubcategory(e.target.value)}
                    placeholder={help("e.g. Japanese Whisky", "例：ジャパニーズウイスキー")} /> : null}
                <Hint>{help("Optional. A smaller group such as Japanese Whisky or Scotch.", "任意。ジャパニーズウイスキーやスコッチなどの小分類です。")}</Hint>
            </Field>
            <Field>
                <Caption htmlFor={id + "-brand"}>{t("brand")}</Caption>
                <TextInput id={id + "-brand"} value={brand} onChange={(e) => setBrand(e.target.value)}
                    placeholder={help("e.g. Nikka", "例：ニッカ")} />
                <Hint>{help("The producer or brand. Leave blank if not applicable.", "メーカー・ブランド名です。該当しない場合は空欄で構いません。")}</Hint>
            </Field>
            {isBeer ? <Field>
                <Caption htmlFor={id + "-volume"}>{t("volume")}</Caption>
                <TextInput id={id + "-volume"} value={volume} onChange={(e) => setVolume(e.target.value)}
                    placeholder={help("e.g. 330ml or 500ml", "例：330ml、500ml")} />
                <Hint>{help("Bottle or can size. Only used for beer.", "瓶・缶の容量です。ビールの場合のみ入力します。")}</Hint>
            </Field> : null}
            <Field>
                <Caption htmlFor={id + "-description"}>{t("description")}</Caption>
                <Area id={id + "-description"} value={description} onChange={(e) => setDescription(e.target.value)}
                    placeholder={help("e.g. Rich, fruity Japanese whisky", "例：フルーティーでコクのあるウイスキー")} />
                <Hint>{help("Optional. A short description for staff and customers.", "任意。スタッフとお客様向けの短い説明です。")}</Hint>
            </Field>
            <Field>
                <Caption htmlFor={id + "-notes"}>{t("notes")}</Caption>
                <Area id={id + "-notes"} value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder={help("e.g. Limited stock, serve chilled", "例：数量限定、冷やして提供")} />
                <Hint>{help("Optional. Internal notes for bar staff.", "任意。スタッフ向けの内部メモです。")}</Hint>
            </Field>
            <Field>
                <Caption htmlFor={id + "-tags"}>{t("tags")}</Caption>
                <TagBox>
                    {tags.map((tag) => <Tag key={tag} type="button"
                        aria-label={help("Remove tag", "タグを削除") + ": " + tag}
                        onClick={() => setTags((current) => current.filter((item) => item !== tag))}>{tag} ×</Tag>)}
                    <TagInput id={id + "-tags"} value={tagDraft}
                        placeholder={help("e.g. Smoky, Peaty, Sweet", "例：スモーキー、ピーティー、甘口")}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }
                        }} />
                    <TagAdd type="button" disabled={!tagDraft.trim()} onClick={addTag}>{help("Add", "追加")}</TagAdd>
                </TagBox>
                <Hint>{help("Optional search keywords. Add one at a time.", "任意。検索に使う特徴のキーワードです。1つずつ追加してください。")}</Hint>
            </Field>
            <SectionHeading>{help("Pricing", "価格")}</SectionHeading>
            <Field>
                <Caption htmlFor={id + "-standard"}>{help("Standard price", "通常価格")}</Caption>
                <Amount><Yen>¥</Yen><PriceInput id={id + "-standard"} type="text" inputMode="numeric" pattern="[0-9]*"
                    placeholder="1200" value={prices.standard}
                    onChange={(e) => setPrices((current) => ({ ...current, standard: e.target.value.replace(/\D/g, "") }))} /></Amount>
                <Hint>{help("Price for a normal serving. Otherwise enter both 15ml and 30ml prices.", "通常の1杯分の価格です。設定しない場合は15mlと30mlの両方を入力してください。")}</Hint>
            </Field>
            <PriceGrid>
                {(["15ml", "30ml"] as const).map((key) => <Field key={key}>
                    <Caption htmlFor={id + "-" + key}>{key}</Caption>
                    <Amount><Yen>¥</Yen><PriceInput id={id + "-" + key} type="text" inputMode="numeric" pattern="[0-9]*"
                        placeholder="¥" value={prices[key]}
                        onChange={(e) => setPrices((current) => ({ ...current, [key]: e.target.value.replace(/\D/g, "") }))} /></Amount>
                </Field>)}
            </PriceGrid>
            <Hint>{help("For premium whiskies, enter both 15ml and 30ml instead of a standard price.", "高級ウイスキーは通常価格の代わりに15mlと30mlの両方を設定できます。")}</Hint>
            <Checks>
                <Check><input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} />
                    <span>{t("inStockLabel")}</span></Check>
                <Hint>{help("Turn off if the drink is not currently available.", "現在販売できない場合はオフにしてください。")}</Hint>
                <Check><input type="checkbox" checked={cocktailIngredient}
                    onChange={(e) => setCocktailIngredient(e.target.checked)} />
                    <span>{t("cocktailIngredient")}</span></Check>
                <Hint>{help("Use for a cocktail ingredient rather than a standalone drink.", "単品ドリンクではなくカクテルの材料として登録する場合に選択します。")}</Hint>
            </Checks>
            {editingItem ? <Hint role="status">{help(
                "Changes affect future orders only. Existing ticket item names and prices are preserved.",
                "変更は今後の注文に反映されます。既存の伝票の商品名と価格は保持されます。"
            )}</Hint> : null}
            {error ? <ErrorText role="alert">{error}</ErrorText> : null}
            <Actions>
                <button type="button" className="hollow" disabled={saving} onClick={closeModal}>{t("cancel")}</button>
                <button type="submit" disabled={saving}>
                    {saving ? help("Saving…", "保存中…") : editingItem ? t("save") : t("addDrink")}
                </button>
            </Actions>
        </Form>
    );

}

const Form = styled.form`
    display: flex; flex-direction: column; gap: var(--space-2);
    padding: 0 var(--space-2) var(--space-2);
    width: 100%; min-width: 0; box-sizing: border-box;
`;
const Field = styled.div`
    display: flex; flex-direction: column; gap: var(--space-0); min-width: 0;
`;
const Caption = styled.label`
    color: var(--neutral-200); font-size: 13px;
    letter-spacing: 0; text-transform: none; line-height: 1.4;
`;
const Hint = styled.small`
    color: var(--neutral-400); font-size: 12px; line-height: 1.5;
    overflow-wrap: anywhere;
`;
const TextInput = styled.input`
    && {
        width: 100%; min-width: 0; min-height: 44px;
        margin: 0; padding: var(--space-1);
        border: 1px solid var(--neutral-600); border-radius: var(--space-1);
        background: var(--neutral-800); color: var(--white);
        font-size: 16px; transform: none; -webkit-transform: none;
        pointer-events: auto; touch-action: manipulation;
    }
    &&:focus { outline: 2px solid var(--royal-400); outline-offset: 1px; transform: none; }
`;
const Area = styled.textarea`
    width: 100%; min-height: 76px; padding: var(--space-1);
    border: 1px solid var(--neutral-600); border-radius: var(--space-1);
    background: var(--neutral-800); color: var(--white);
    font-size: 16px; resize: vertical; pointer-events: auto;
    &:focus { outline: 2px solid var(--royal-400); outline-offset: 1px; }
`;
const SelectWrap = styled.div`position: relative; min-width: 0;`;
const SelectInput = styled.select`
    width: 100%; min-width: 0; min-height: 44px;
    padding: var(--space-1) 44px var(--space-1) var(--space-1);
    border: 1px solid var(--neutral-600); border-radius: var(--space-1);
    background: var(--neutral-800); color: var(--white);
    font-size: 16px; appearance: none; -webkit-appearance: none;
    position: relative; z-index: 1; cursor: pointer;
    pointer-events: auto; touch-action: manipulation;
    &:focus { outline: 2px solid var(--royal-400); outline-offset: 1px; }
`;
const Caret = styled.span`
    position: absolute; z-index: 2; right: 15px; top: 50%;
    transform: translateY(-58%); font-size: 30px; font-weight: bold;
    line-height: 1; color: var(--neutral-100); pointer-events: none;
`;
const TagBox = styled.div`
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1);
    border: 1px solid var(--neutral-600); border-radius: var(--space-1);
    background: var(--neutral-800); padding: var(--space-0);
    &:focus-within { outline: 2px solid var(--royal-400); }
`;
const Tag = styled.button`
    width: auto; min-height: 34px; padding: 0.3em 0.65em;
    border-radius: 999px; background: var(--neutral-700); font-size: 12px;
`;
const TagInput = styled.input`
    && {
        flex: 1 1 130px; width: auto; min-width: 0; min-height: 44px;
        padding: var(--space-0); font-size: 16px; color: var(--white);
        background: transparent; border: 0; transform: none; pointer-events: auto;
    }
    &&:focus { outline: 2px solid var(--royal-400); transform: none; }
`;
const TagAdd = styled.button`
    width: auto; min-height: 38px; padding: 0.5em 0.75em; font-size: 14px;
`;
const SectionHeading = styled.h4`
    font-size: var(--font-size-h5); padding-top: var(--space-1);
    border-top: 1px solid var(--neutral-700);
`;
const PriceGrid = styled.div`
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-1);
`;
const Amount = styled.div`
    display: flex; align-items: center; gap: var(--space-0); min-width: 0;
    background: var(--neutral-800); border: 1px solid var(--neutral-600);
    border-radius: var(--space-1); padding-left: var(--space-1);
    &:focus-within { outline: 2px solid var(--royal-400); outline-offset: 1px; }
`;
const Yen = styled.span`color: var(--neutral-200); font-family: var(--font-family-data);`;
const PriceInput = styled.input`
    && {
        flex: 1; width: 100%; min-width: 0; min-height: 44px;
        margin: 0; padding: var(--space-1) var(--space-1) var(--space-1) 0;
        font-size: 16px; color: var(--white); border: 0;
        background: transparent; font-family: var(--font-family-data);
        transform: none; -webkit-transform: none;
        pointer-events: auto; touch-action: manipulation;
    }
    &&:focus { outline: 0; background: transparent; transform: none; }
`;
const Checks = styled.div`display: flex; flex-direction: column; gap: var(--space-0);`;
const Check = styled.label`
    display: flex; align-items: center; gap: var(--space-1);
    color: var(--neutral-100); font-size: 16px; line-height: 1.3;
    letter-spacing: 0; text-transform: none;
    input { width: 20px; height: 20px; margin: 0; padding: 0; transform: none; }
`;
const ErrorText = styled.p`color: var(--danger-400); font-size: 14px;`;
const Actions = styled.div`
    position: sticky; bottom: 0; z-index: 3; display: flex; gap: var(--space-1);
    padding: var(--space-1) 0; background: var(--neutral-900);
    button { flex: 1; min-width: 0; }
`;
