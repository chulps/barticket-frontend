import { useState } from "react";
import styled from "styled-components";

import type { MenuItem, Prices } from "../types/Menu";
import { useI18n } from "../i18n";
import { useModal } from "../hooks/useModal";

const PRICE_KEYS = ["standard", "15ml", "30ml"] as const;

type MenuPriceEditorProps = {
    item: MenuItem;
    onSave: (prices: Prices) => Promise<void>;
};

export default function MenuPriceEditor({ item, onSave }: MenuPriceEditorProps) {
    const { t } = useI18n();
    const { closeModal } = useModal();
    const keys = PRICE_KEYS.filter((key) => item.prices?.[key] !== undefined);
    const [values, setValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(keys.map((key) => [key, String(item.prices[key])])),
    );
    const [saving, setSaving] = useState(false);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const prices: Prices = {};
        for (const key of keys) {
            const raw = values[key] ?? "";
            const amount = Number(raw);
            if (raw === "" || !Number.isInteger(amount) || amount < 0) {
                window.alert(t("priceMinimum"));
                return;
            }
            prices[key] = amount;
        }
        setSaving(true);
        try {
            await onSave(prices);
            closeModal();
        } catch {
            // The page shows the error.
        } finally {
            setSaving(false);
        }
    }

    return (
        <Form onSubmit={save}>
            {keys.map((key) => (
                <Field key={key}>
                    <span>{key === "standard" ? "¥" : key}</span>
                    <Input
                        inputMode="numeric"
                        value={values[key] ?? ""}
                        onChange={(event) =>
                            setValues((current) => ({
                                ...current,
                                [key]: event.target.value.replace(/\D/g, ""),
                            }))
                        }
                    />
                </Field>
            ))}
            <Save type="submit" disabled={saving}>
                {t("save")}
            </Save>
        </Form>
    );
}

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
`;

const Field = styled.label`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
`;

const Input = styled.input`
    width: 8rem;
    padding: var(--space-0);
    font-size: var(--font-size-h6);
    text-align: right;
    background: var(--neutral-800);
    border-color: var(--primary);
`;

const Save = styled.button`
    align-self: flex-end;
`;
