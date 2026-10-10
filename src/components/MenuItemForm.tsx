import { useState, type FormEvent } from "react";
import styled from "styled-components";

import type { Prices } from "../types/Menu";
import { useI18n } from "../i18n";
import { useModal } from "../hooks/useModal";
import { createMenuItem } from "../api/menu";
import { ApiError } from "../api/client";

const PRICE_KEYS = ["standard", "15ml", "30ml"] as const;

type MenuItemFormProps = {
    categories: string[];
    subcategories: string[];
    onCreated: (item: Awaited<ReturnType<typeof createMenuItem>>) => void;
};

export default function MenuItemForm({
    categories,
    subcategories,
    onCreated,
}: MenuItemFormProps) {
    const { t } = useI18n();
    const { closeModal } = useModal();
    const [name, setName] = useState("");
    const [category, setCategory] = useState("");
    const [subcategory, setSubcategory] = useState("");
    const [brand, setBrand] = useState("");
    const [volume, setVolume] = useState("");
    const [description, setDescription] = useState("");
    const [notes, setNotes] = useState("");
    const [tags, setTags] = useState<string[]>([]);
    const [tagDraft, setTagDraft] = useState("");
    const [prices, setPrices] = useState<Record<string, string>>({
        standard: "",
        "15ml": "",
        "30ml": "",
    });
    const [inStock, setInStock] = useState(true);
    const [cocktailIngredient, setCocktailIngredient] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    function addTag() {
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
            if (!Number.isInteger(amount) || amount < 0) {
                setError(t("priceMinimum"));
                return;
            }
            nextPrices[key] = amount;
        }
        if (!cocktailIngredient && Object.keys(nextPrices).length === 0) {
            setError(t("menuItemPriceRequired"));
            return;
        }
        setError("");
        setSaving(true);
        try {
            const created = await createMenuItem({
                name: trimmedName,
                category: trimmedCategory,
                subcategory: subcategory.trim() || undefined,
                description: description.trim() || undefined,
                notes: notes.trim() || undefined,
                brand: brand.trim() || undefined,
                volume: volume.trim() || undefined,
                tags: nextTags,
                prices: nextPrices,
                in_stock: inStock,
                cocktail_ingredient: cocktailIngredient,
            });
            onCreated({ ...created, prices: created.prices ?? {} });
            closeModal();
        } catch (caught) {
            setError(caught instanceof ApiError ? caught.message : t("addMenuItemFailed"));
        } finally {
            setSaving(false);
        }
    }

    const priceLabel = {
        standard: t("price"),
        "15ml": "15ml",
        "30ml": "30ml",
    };

    return (
        <Form onSubmit={save}>
            <Field>
                <Caption>{t("name")}</Caption>
                <TextInput value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Row>
                <Field>
                    <Caption>{t("category")}</Caption>
                    <TextInput
                        list="menu-item-categories"
                        value={category}
                        onChange={(event) => setCategory(event.target.value)}
                    />
                    <datalist id="menu-item-categories">
                        {categories.map((option) => (
                            <option key={option} value={option} />
                        ))}
                    </datalist>
                </Field>
                <Field>
                    <Caption>{t("subcategory")}</Caption>
                    <TextInput
                        list="menu-item-subcategories"
                        value={subcategory}
                        onChange={(event) => setSubcategory(event.target.value)}
                    />
                    <datalist id="menu-item-subcategories">
                        {subcategories.map((option) => (
                            <option key={option} value={option} />
                        ))}
                    </datalist>
                </Field>
            </Row>
            <Row>
                <Field>
                    <Caption>{t("brand")}</Caption>
                    <TextInput value={brand} onChange={(event) => setBrand(event.target.value)} />
                </Field>
                <Field>
                    <Caption>{t("volume")}</Caption>
                    <TextInput value={volume} onChange={(event) => setVolume(event.target.value)} />
                </Field>
            </Row>
            <Field>
                <Caption>{t("description")}</Caption>
                <Area value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <Field>
                <Caption>{t("notes")}</Caption>
                <Area value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <Field>
                <Caption>{t("tags")}</Caption>
                <TagBox>
                    {tags.map((tag) => (
                        <Tag
                            key={tag}
                            type="button"
                            onClick={() => setTags((current) => current.filter((item) => item !== tag))}
                        >
                            {tag} ✕
                        </Tag>
                    ))}
                    <TagInput
                        value={tagDraft}
                        placeholder={t("tagHint")}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === ",") {
                                event.preventDefault();
                                addTag();
                            }
                        }}
                        onBlur={addTag}
                    />
                </TagBox>
            </Field>
            <PriceGrid>
                {PRICE_KEYS.map((key) => (
                    <Field key={key}>
                        <Caption>{priceLabel[key]}</Caption>
                        <Amount>
                            <Yen>¥</Yen>
                            <PriceInput
                                inputMode="numeric"
                                value={prices[key]}
                                onChange={(event) =>
                                    setPrices((current) => ({
                                        ...current,
                                        [key]: event.target.value.replace(/\D/g, ""),
                                    }))
                                }
                            />
                        </Amount>
                    </Field>
                ))}
            </PriceGrid>
            <Checks>
                <Check>
                    <input
                        type="checkbox"
                        checked={inStock}
                        onChange={(event) => setInStock(event.target.checked)}
                    />
                    {t("inStockLabel")}
                </Check>
                <Check>
                    <input
                        type="checkbox"
                        checked={cocktailIngredient}
                        onChange={(event) => setCocktailIngredient(event.target.checked)}
                    />
                    {t("cocktailIngredient")}
                </Check>
            </Checks>
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Actions>
                <button type="button" className="hollow" onClick={closeModal}>
                    {t("cancel")}
                </button>
                <button type="submit" disabled={saving}>
                    {t("addDrink")}
                </button>
            </Actions>
        </Form>
    );
}

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-2) var(--space-2);
    box-sizing: border-box;
    width: 100%;
`;

const Row = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);

    @media (max-width: 520px) {
        grid-template-columns: 1fr;
    }
`;

const PriceGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-1);

    @media (max-width: 520px) {
        grid-template-columns: 1fr;
    }
`;

const Field = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: 0;
`;

const Caption = styled.span`
    font-size: var(--font-size-small);
    color: var(--neutral-400);
`;

const TextInput = styled.input`
    && {
        width: 100%;
        margin: 0;
        border: 1px solid var(--neutral-700);
        border-radius: var(--space-1);
        background: var(--neutral-800);
        padding: var(--space-1);
        transform: none;
    }

    &&:focus {
        outline: none;
        border-color: var(--royal-400);
        background: var(--neutral-800);
        transform: none;
    }
`;

const Area = styled.textarea`
    width: 100%;
    min-height: 4.5rem;
    resize: vertical;
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);
    background: var(--neutral-800);
    color: inherit;
    font: inherit;
    padding: var(--space-1);
    box-sizing: border-box;

    &:focus {
        outline: none;
        border-color: var(--royal-400);
    }
`;

const TagBox = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-0);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);
    background: var(--neutral-800);
    padding: var(--space-0);

    &:focus-within {
        border-color: var(--royal-400);
    }
`;

const Tag = styled.button`
    width: auto;
    padding: 0.25em 0.7em;
    border-radius: 999px;
    background: var(--neutral-700);
    font-size: var(--font-size-small);

    &:hover {
        background: var(--neutral-600);
        transform: none;
    }
`;

const TagInput = styled.input`
    && {
        flex: 1;
        min-width: 8rem;
        width: auto;
        margin: 0;
        border: none;
        background: transparent;
        padding: var(--space-0);
        transform: none;
    }

    &&:focus {
        outline: none;
        border: none;
        background: transparent;
        transform: none;
    }
`;

const Amount = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-0);
    background: var(--neutral-800);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);
    padding: 0 var(--space-1);

    &:focus-within {
        border-color: var(--royal-400);
    }
`;

const Yen = styled.span`
    color: var(--neutral-400);
    font-family: var(--font-family-data);
`;

const PriceInput = styled.input`
    && {
        width: 8rem;
        margin: 0;
        border: none;
        background: transparent;
        padding: var(--space-1) 0;
        text-align: left;
        font-family: var(--font-family-data);
        transform: none;
    }

    &&:focus {
        outline: none;
        border: none;
        background: transparent;
        transform: none;
    }
`;

const Checks = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
`;

const Check = styled.label`
    display: flex;
    align-items: center;
    gap: var(--space-1);
    text-transform: none;
    letter-spacing: 0;
    line-height: 1.2;
    color: var(--neutral-100);
    font-size: var(--font-size-default);

    input {
        width: auto;
        margin: 0;
        padding: 0;
        border: none;
        background: transparent;
        transform: none;
    }

    input:focus {
        outline: none;
        transform: none;
        background: transparent;
    }
`;

const ErrorText = styled.p`
    margin: 0;
    color: var(--danger-400);
    font-size: var(--font-size-small);
`;

const Actions = styled.div`
    display: flex;
    gap: var(--space-1);

    button {
        flex: 1;
        width: auto;
    }
`;
