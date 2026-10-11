import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { accountApi } from "../api/account";
import type { MenuData } from "../types/Menu";
import { menuHaystack, menuLabel, useI18n } from "../i18n";

type Props = {
    menu: MenuData;
    onAdd: (staffId: number, menuItemId: number | null, priceKey: string, quantity: number) => void;
};

export default function AddStaffDrink({ menu, onAdd }: Props) {
    const { locale } = useI18n();
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
        return menu.items.filter(row =>
            row.inStock !== false &&
            row.category !== "Cocktail Ingredients" &&
            Object.values(row.prices).some(value => typeof value === "number") &&
            (!term || [row.name, row.brand, row.category, row.subcategory, row.volume, row.description, row.tags?.join(" ")]
                .map(value => menuHaystack(value ?? "").toLowerCase())
                .some(value => value.includes(term)))
        );
    }, [menu.items, search]);
    const item = menu.items.find(row => row.id === itemId);
    const prices: [string, number][] = item
        ? Object.entries(item.prices).filter((entry): entry is [string, number] => typeof entry[1] === "number")
        : [["standard", 500]];
    const selectedKey = prices.some(([key]) => key === priceKey) ? priceKey : (prices[0]?.[0] ?? "standard");
    const price = prices.find(([key]) => key === selectedKey)?.[1] ?? 500;

    return (
        <Form onSubmit={event => {
            event.preventDefault();
            if (!staffId) return;
            onAdd(Number(staffId), item?.id ?? null, item ? selectedKey : "standard", 1);
        }}>
            <label>{locale === "ja" ? "スタッフ" : "Staff recipient"}
                <select required value={staffId} onChange={event => setStaffId(event.target.value)}>
                    <option value="">{locale === "ja" ? "選択" : "Select staff"}</option>
                    {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
            </label>
            <div className="drink-field">
                <label htmlFor="staff-drink-search">{locale === "ja" ? "ドリンクを検索" : "Search drinks"}</label>
                <input id="staff-drink-search" type="search" placeholder={locale === "ja" ? "メニュー名・カテゴリで検索" : "Search entire menu…"} value={search} onChange={event => setSearch(event.target.value)} />
                <div className="choices" role="group" aria-label={locale === "ja" ? "ドリンク" : "Drinks"}>
                    <button type="button" className={itemId === null ? "selected" : ""} aria-pressed={itemId === null} onClick={() => { setItemId(null); setPriceKey("standard"); }}>
                        {locale === "ja" ? "通常スタッフドリンク" : "Default Staff Drink"} <span>¥500</span>
                    </button>
                    {matches.map(row => {
                        const startingPrice = Object.values(row.prices).find(value => typeof value === "number");
                        return <button key={row.id} type="button" className={itemId === row.id ? "selected" : ""} aria-pressed={itemId === row.id} onClick={() => { setItemId(row.id); setPriceKey("standard"); }}>
                            {menuLabel(locale, row.name)} <span>¥{startingPrice?.toLocaleString()}</span>
                        </button>;
                    })}
                    {matches.length === 0 && search.trim() ? <p>{locale === "ja" ? "一致するドリンクはありません" : "No matching drinks"}</p> : null}
                </div>
            </div>
            {item && prices.length > 1 ? <label>{locale === "ja" ? "サイズ・価格" : "Size / price"}
                <select value={selectedKey} onChange={event => setPriceKey(event.target.value)}>
                    {prices.map(([key, value]) => <option key={key} value={key}>{key} — ¥{value.toLocaleString()}</option>)}
                </select>
            </label> : null}
            <div className="preview"><span>{item ? menuLabel(locale, item.name) : (locale === "ja" ? "通常スタッフドリンク" : "Default Staff Drink")}</span><strong>¥{price.toLocaleString()}</strong></div>
            <small>{locale === "ja" ? "1回につき1杯追加します。伝票上で数量と価格を変更できます。" : "Adds one drink. Adjust quantity or price on the ticket."}</small>
            {error ? <p role="alert">{error}</p> : null}
            <button className="submit" type="submit" disabled={!staffId}>{locale === "ja" ? "伝票に追加" : "Add to ticket"}</button>
        </Form>
    );
}

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
    width: 100%;
    label { display: flex; flex-direction: column; gap: var(--space-0); }
    select, input { width: 100%; box-sizing: border-box; padding: var(--space-1); background: var(--neutral-900); color: white; border: 1px solid var(--neutral-600); border-radius: 6px; }
    .drink-field { min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
    .choices { max-height: min(35vh, 300px); overflow-y: auto; display: flex; flex-direction: column; border: 1px solid var(--neutral-700); border-radius: 6px; }
    .choices button { text-align: left; display: flex; justify-content: space-between; gap: var(--space-1); padding: var(--space-1); background: transparent; color: inherit; cursor: pointer; border: none; border-bottom: 1px solid var(--neutral-800); }
    .choices button.selected { background: var(--royal-500); color: white; }
    .choices button span { white-space: nowrap; }
    .choices p { padding: var(--space-1); }
    .preview { display: flex; justify-content: space-between; align-items: center; gap: var(--space-1); font-weight: 600; }
    .submit { width: 100%; }
`;
