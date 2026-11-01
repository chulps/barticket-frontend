import styled from "styled-components";
import { useI18n } from "../i18n";

export type RequestStateKind = "loading" | "empty" | "forbidden" | "offline" | "error" | "failed-save";

type RequestStateProps = {
  kind: RequestStateKind;
  detail?: string;
  onRetry?: () => void;
  compact?: boolean;
};

/** Read-only status UI. Retry callbacks must refresh state or fetch GET data;
 * never bind a payment, refund, shift-close or other non-idempotent POST. */
export default function RequestState({ kind, detail, onRetry, compact = false }: RequestStateProps) {
  const { locale } = useI18n();
  const ja = locale === "ja";
  const messages: Record<RequestStateKind, [string, string]> = {
    loading: ["読み込み中…", "Loading…"],
    empty: ["表示するデータがありません。", "Nothing to display yet."],
    forbidden: ["この情報へのアクセス権がありません。", "You don't have access to this information."],
    offline: ["接続できません。復旧後にデータを再確認してください。", "Connection unavailable. Check the latest data when connectivity returns."],
    error: ["データを読み込めませんでした。表示中の情報が古い可能性があります。", "Could not load the latest data. Displayed information may be outdated."],
    "failed-save": ["保存結果を確認できません。再操作する前に最新の状態を確認してください。", "Save result unknown. Check current state before attempting another write."],
  };
  const warning = ["forbidden", "offline", "error", "failed-save"].includes(kind);
  return <Notice $compact={compact} $warning={warning}
      role={warning ? "alert" : "status"}
      aria-live={warning ? "assertive" : "polite"}
      aria-busy={kind === "loading"}>
    <span>{detail || messages[kind][ja ? 0 : 1]}</span>
    {onRetry && kind !== "loading" ? <button type="button" className="small hollow secondary"
        onClick={onRetry}>{ja ? "状態を再確認" : "Refresh status"}</button> : null}
  </Notice>;
}

const Notice = styled.div<{ $compact: boolean; $warning: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  padding: ${({ $compact }) => $compact ? "var(--space-1)" : "var(--space-2)"};
  border-radius: var(--space-1);
  border: 1px solid ${({ $warning }) => $warning ? "var(--danger-500)" : "var(--neutral-700)"};
  color: inherit;
  min-width: 0;
  span { overflow-wrap: anywhere; flex: 1 1 15rem; }
  button { width: auto; min-height: 44px; }
`;
