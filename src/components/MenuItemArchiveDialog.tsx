import { useRef, useState } from "react";
import type { MenuItem } from "../types/Menu";
import { useModal } from "../hooks/useModal";
import { menuLabel, useI18n } from "../i18n";

/** Confirmation is deliberately a soft delete. Historic tickets stay untouched. */
export default function MenuItemArchiveDialog({ item, onArchive }: {
    item: MenuItem;
    onArchive: (item: MenuItem) => Promise<boolean>;
}) {
    const { locale } = useI18n();
    const { closeModal, forceCloseModal } = useModal();
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const pending = useRef(false);
    const ja = locale === "ja";

    async function archive() {
        if (pending.current) return;
        pending.current = true;
        setSaving(true);
        setError("");
        try {
            if (await onArchive(item)) {
                forceCloseModal();
            } else {
                setError(ja ? "アーカイブを確認できませんでした。メニューを更新してください。" : "Could not confirm archive. Refresh the menu before retrying.");
            }
        } catch {
            setError(ja ? "アーカイブに失敗しました。再操作前にメニューを確認してください。" : "Archive failed. Check the menu before retrying.");
        } finally {
            pending.current = false;
            setSaving(false);
        }
    }

    return <div style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-2)" }}>
        <strong>{menuLabel(locale, item.name)}</strong>
        <p>{ja
            ? "この商品を販売メニューから非表示にします。過去の伝票、売上、価格履歴は削除されません。アーカイブ一覧から復元できます。"
            : "This removes the item from the active menu and new orders. Existing tickets, sales and recorded prices are preserved. You can restore it later from Archived Items."}</p>
        {error ? <p role="alert">{error}</p> : null}
        <div style={{ display: "flex", gap: "var(--space-1)" }}>
            <button type="button" className="hollow secondary" disabled={saving} onClick={closeModal}>
                {ja ? "キャンセル" : "Cancel"}
            </button>
            <button type="button" className="danger" disabled={saving} onClick={() => void archive()}>
                {saving ? (ja ? "処理中…" : "Archiving…") : (ja ? "アーカイブする" : "Archive Item")}
            </button>
        </div>
    </div>;
}
