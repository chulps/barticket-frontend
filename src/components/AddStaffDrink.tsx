import { useEffect, useState } from "react";
import styled from "styled-components";
import { accountApi } from "../api/account";
import type { MenuData } from "../types/Menu";
import { useI18n, menuLabel } from "../i18n";

type Props = {
    menu: MenuData;
    onAdd: (staffId: number, menuItemId: number | null, priceKey: string, quantity: number) => void;
};

export default function AddStaffDrink({ menu, onAdd }: Props) {
    const { locale } = useI18n();
    const [people, setPeople] = useState<{ id: number; name: string }[]>([]);
    const [staffId, setStaffId] = useState("");
    const [itemId, setItemId] = useState("");
    const [priceKey, setPriceKey] = useState("standard");
    const [quantity, setQuantity] = useState(1);
    const [error, setError] = useState("");
    useEffect(() => {
        accountApi.staffDrinkRecipients().then(setPeople).catch(() => setError(locale === "ja" ? "スタッフを取得できません" : "Could not load staff"));
    }, [locale]);
    const item = menu.items.find(row => String(row.id) === itemId);
    const prices = item ? Object.entries(item.prices).filter((entry): entry is [string, number] => typeof entry[1] === "number") : [["standard", 500] as [string, number]];
    const price = prices.find(([key]) => key === priceKey)?.[1] ?? prices[0]?.[1] ?? 500;
    return (
        <Form onSubmit={event => {
            event.preventDefault();
            if (!staffId || quantity < 1) return;
            onAdd(Number(staffId), item ? item.id : null, item ? priceKey : "standard", quantity);
        }}>
            <label>{locale === "ja" ? "スタッフ" : "Staff recipient"}
                <select required value={staffId} onChange={event => setStaffId(event.target.value)}>
                    <option value="">{locale === "ja" ? "選択" : "Select staff"}</option>
                    {people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
            </label>
            <label>{locale === "ja" ? "ドリンク" : "Drink"}
                <select value={itemId} onChange={event => { setItemId(event.target.value); setPriceKey("standard"); }}>
                    <option value="">{locale === "ja" ? "通常スタッフドリンク — ¥500" : "Default Staff Drink — ¥500"}</option>
                    {menu.items.filter(row => row.inStock !== false && row.category !== "Cocktail Ingredients" && Object.values(row.prices).some(value => typeof value === "number")).map(row =>
                        <option key={row.id} value={row.id}>{menuLabel(locale, row.name)}</option>
                    )}
                </select>
            </label>
            {item ? <label>{locale === "ja" ? "サイズ・価格" : "Size / price"}
                <select value={priceKey} onChange={event => setPriceKey(event.target.value)}>
                    {prices.map(([key, value]) => <option key={key} value={key}>{key} — ¥{value.toLocaleString()}</option>)}
                </select>
            </label> : null}
            <label>{locale === "ja" ? "数量" : "Quantity"}
                <input type="number" min="1" step="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))} />
            </label>
            <p>{locale === "ja" ? "単価" : "Unit price"}: ¥{price.toLocaleString()}</p>
            {error ? <p role="alert">{error}</p> : null}
            <button type="submit" disabled={!staffId || !Number.isInteger(quantity) || quantity < 1}>{locale === "ja" ? "伝票に追加" : "Add to ticket"}</button>
        </Form>
    );
}

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    label { display: flex; flex-direction: column; gap: var(--space-0); }
    select, input { width: 100%; padding: var(--space-1); background: var(--neutral-900); color: white; border: 1px solid var(--neutral-600); border-radius: 6px; }
`;
