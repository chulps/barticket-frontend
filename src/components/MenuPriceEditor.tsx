import { useEffect, useRef, useState } from "react";
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
    const { t, locale } = useI18n();
    const { closeModal, forceCloseModal, registerCloseGuard } = useModal();
    const dirty = useRef(false);
    const pending = useRef(false);
    useEffect(() => {
        registerCloseGuard(() => !pending.current && (!dirty.current || window.confirm(locale === "ja"
            ? "保存していない変更を破棄しますか？" : "Discard unsaved changes?")));
        return () => registerCloseGuard(null);
    }, [locale, registerCloseGuard]);
    const keys = PRICE_KEYS.filter((key) => item.prices?.[key] !== undefined);
    const [values, setValues] = useState<Record<string, string>>(() =>
        Object.fromEntries(keys.map((key) => [key, String(item.prices[key])])),
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    async function save(event: React.FormEvent) {
        event.preventDefault();
        if (pending.current) return;
        const prices: Prices = {};
        for (const key of keys) {
            const raw = values[key] ?? "";
            const amount = Number(raw);
            if (raw === "" || !Number.isInteger(amount) || amount < 0) {
                setError(t("priceMinimum"));
                return;
            }
            prices[key] = amount;
        }
        setError("");
        pending.current = true;
        setSaving(true);
        try {
            await onSave(prices);
            dirty.current = false;
            forceCloseModal();
        } catch {
            // The page shows the error.
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }

    return (
        <Form onSubmit={save} onChangeCapture={() => { dirty.current = true; }}>
            {keys.map((key) => (
                <Field key={key}>
                    <Caption>{key === "standard" ? t("price") : key}</Caption>
                    <Amount>
                        <Yen>¥</Yen>
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
                    </Amount>
                </Field>
            ))}
            {error ? <ErrorText>{error}</ErrorText> : null}
            <Actions>
                <button type="button" className="hollow" disabled={saving} onClick={closeModal}>
                    {t("cancel")}
                </button>
                <button type="submit" disabled={saving}>
                    {t("save")}
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

const Field = styled.div`
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
`;

const Caption = styled.span`
    font-size: var(--font-size-small);
    color: var(--neutral-400);
`;

const Amount = styled.div`
    display: flex;
    align-items: center;
    justify-content: flex-end;
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

const Input = styled.input`
    && {
        width: 8rem;
        margin: 0;
        border: none;
        background: transparent;
        padding: var(--space-1) 0;
        text-align: right;
        font-family: var(--font-family-data);
        font-size: var(--font-size-h4);
        transform: none;
    }

    &&:focus {
        outline: none;
        border: none;
        background: transparent;
        transform: none;
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
