import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { accountApi } from "../api/account";
import type { MenuData } from "../types/Menu";
import { menuHaystack, menuLabel, useI18n } from "../i18n";

type Props = {
    menu: MenuData;
    onAdd: (staffId: number, menuItemId: number | null, priceKey: string, quantity: number, details?: { name: string; staffName: string; price: number }) => void;
};

function numericPrices(prices: object | null | undefined): [string, number][] {
    return Object.entries(prices ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === "number");
}

export default function AddStaffDrink({ menu, onAdd }: Props) {
    const { t, locale } = useI18n();
    const [people, setPeople] = useState<{ id: number; name: string }[]>([]);
    const [staffId, setStaffId] = useState("");
    const [itemId, setItemId] = useState<number | null>(null);
    const [search, setSearch] = useState("");
    const [priceKey, setPriceKey] = useState("standard");
    const [error, setError] = useState("");

    useEffect(() => {
        accountApi.staffDrinkRecipients().then(setPeople).catch(() =>
            setError(locale === "ja" ? "スタッフを取得できません" : "Could not load staff"));
    }, [locale]);

    const matches = useMemo(() => {
        const term = menuHaystack(search).toLowerCase().trim();
        if (!term) return [];
        return menu.items.filter(row =>
            row.inStock !== false &&
            row.category !== "Cocktail Ingredients" &&
            numericPrices(row.prices).length > 0 &&
            [row.name, row.brand, row.category, row.subcategory, row.volume, row.description, row.tags?.join(" ")]
                .map(value => menuHaystack(value ?? "").toLowerCase())
                .some(value => value.includes(term))
        ).slice(0, 40);
    }, [menu.items, search]);
    const item = menu.items.find(row => row.id === itemId);
    const prices: [string, number][] = item ? numericPrices(item.prices) : [["standard", 500]];
    const selectedKey = prices.some(([key]) => key === priceKey) ? priceKey : (prices[0]?.[0] ?? "standard");
    const price = prices.find(([key]) => key === selectedKey)?.[1] ?? 500;

    return (
        <Form onSubmit={event => {
            event.preventDefault();
            if (!staffId) {
                setError(t("selectStaffFirst"));
                return;
            }
            onAdd(Number(staffId), item?.id ?? null, item ? selectedKey : "standard", 1, {
                name: item?.name ?? "Staff Drink",
                staffName: people.find(person => String(person.id) === staffId)?.name ?? "Staff",
                price,
            });
        }}>
            <div className="people-field">
                <span>{locale === "ja" ? "スタッフ" : "Staff recipient"}</span>
                <div className="people" role="group" aria-label={locale === "ja" ? "スタッフ" : "Staff recipient"}>
                    {people.map(person => (
                        <button
                            key={person.id}
                            type="button"
                            className={staffId === String(person.id) ? "selected" : ""}
                            aria-pressed={staffId === String(person.id)}
                            onClick={() => {
                                setStaffId(String(person.id));
                                setError("");
                            }}
                        >
                            {person.name}
                        </button>
                    ))}
                </div>
            </div>
            <div className="drink-field">
                <label htmlFor="staff-drink-search">{locale === "ja" ? "ドリンクを検索" : "Search drinks"}</label>
                <input id="staff-drink-search" type="search" placeholder={locale === "ja" ? "メニュー名・カテゴリで検索" : "Search entire menu…"} value={search} onChange={event => setSearch(event.target.value)} />
                <div className="choices" role="group" aria-label={locale === "ja" ? "ドリンク" : "Drinks"}>
                    <button type="button" className={itemId === null ? "selected" : ""} aria-pressed={itemId === null} onClick={() => { setItemId(null); setPriceKey("standard"); }}>
                        {locale === "ja" ? "通常スタッフドリンク" : "Default Staff Drink"} <span>¥500</span>
                    </button>
                    {matches.map(row => {
                        const startingPrice = numericPrices(row.prices)[0]?.[1];
                        return <button key={row.id} type="button" className={itemId === row.id ? "selected" : ""} aria-pressed={itemId === row.id} onClick={() => { setItemId(row.id); setPriceKey("standard"); }}>
                            {menuLabel(locale, row.name)} <span>¥{startingPrice?.toLocaleString()}</span>
                        </button>;
                    })}
                    {matches.length === 0 && search.trim() ? <p>{locale === "ja" ? "一致するドリンクはありません" : "No matching drinks"}</p> : null}
                </div>
            </div>
            {item && prices.length > 1 ? <div className="sizes" role="group" aria-label={locale === "ja" ? "サイズ・価格" : "Size / price"}>
                {prices.map(([key, value]) => (
                    <button key={key} type="button" className={selectedKey === key ? "selected" : ""} aria-pressed={selectedKey === key} onClick={() => setPriceKey(key)}>
                        {key} ¥{value.toLocaleString()}
                    </button>
                ))}
            </div> : null}
            <div className="dock">
                <div className="preview"><span>{item ? menuLabel(locale, item.name) : (locale === "ja" ? "通常スタッフドリンク" : "Default Staff Drink")}</span><strong>¥{price.toLocaleString()}</strong></div>
                {error ? <p role="alert">{error}</p> : null}
                <button className="submit" type="submit">{locale === "ja" ? "伝票に追加" : "Add to ticket"}</button>
            </div>
        </Form>
    );
}

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    width: 100%;
    padding: 0 var(--space-2);
    box-sizing: border-box;
    .people-field { display: flex; flex-direction: column; gap: var(--space-1); }
    .people-field > span { font-size: var(--font-size-label); letter-spacing: 2px; text-transform: uppercase; color: var(--secondary); }
    .people, .sizes { display: flex; flex-wrap: wrap; gap: var(--space-1); }
    .people button, .sizes button {
        width: auto;
        min-height: 44px;
        padding: var(--space-1) var(--space-2);
        background: transparent;
        color: white;
        border: 1px solid var(--neutral-600);
        border-radius: 999px;
        transform: none;
    }
    .people button:hover, .sizes button:hover, .people button:active, .sizes button:active {
        background: var(--neutral-800);
        color: white;
        transform: none;
        filter: none;
    }
    .people button.selected, .sizes button.selected, .people button.selected:hover, .sizes button.selected:hover {
        background: var(--royal-500);
        border-color: var(--royal-500);
        color: white;
    }
    input, input:focus {
        width: 100%;
        box-sizing: border-box;
        padding: var(--space-1);
        background: var(--neutral-900);
        color: white;
        border: 1px solid var(--neutral-600);
        border-radius: 6px;
        transform: none;
    }
    .drink-field { min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
    .choices { max-height: min(32dvh, 280px); overflow-y: auto; display: flex; flex-direction: column; border: 1px solid var(--neutral-700); border-radius: 6px; }
    .choices button {
        text-align: left;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--space-1);
        min-height: 44px;
        padding: var(--space-1);
        background: transparent;
        color: inherit;
        cursor: pointer;
        border: none;
        border-bottom: 1px solid var(--neutral-800);
        border-radius: 0;
        white-space: normal;
        transform: none;
    }
    .choices button:hover, .choices button:active { background: var(--neutral-800); color: inherit; transform: none; filter: none; }
    .choices button.selected, .choices button.selected:hover { background: var(--royal-500); color: white; }
    .choices button span { white-space: nowrap; }
    .choices p { padding: var(--space-1); }
    .dock {
        position: sticky;
        bottom: 0;
        z-index: 2;
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        margin-inline: calc(var(--space-2) * -1);
        padding: var(--space-1) var(--space-2) calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
        background: var(--neutral-900);
        border-top: 1px solid var(--neutral-700);
    }
    .preview { display: flex; justify-content: space-between; align-items: center; gap: var(--space-1); font-weight: 600; }
    .preview span { min-width: 0; }
    .submit { width: 100%; }
`;
