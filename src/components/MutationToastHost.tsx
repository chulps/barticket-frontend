import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { FEEDBACK_EVENT, type MutationFeedback } from "../utils/mutationFeedback";
import { useI18n } from "../i18n";

export default function MutationToastHost() {
  const { locale } = useI18n();
  const [messages, setMessages] = useState<MutationFeedback[]>([]);
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    const onFeedback = (event: Event) => {
      const message = (event as CustomEvent<MutationFeedback>).detail;
      if (!message || !["success", "error", "info"].includes(message.kind) || !message.message) return;
      setMessages(current => [...current.filter(item => item.message !== message.message), message].slice(-3));
      const timer = window.setTimeout(() => {
        setMessages(current => current.filter(item => item.id !== message.id));
        timers.current.delete(message.id);
      }, message.kind === "error" ? 7500 : 4000);
      timers.current.set(message.id, timer);
    };
    window.addEventListener(FEEDBACK_EVENT, onFeedback);
    const activeTimers = timers.current;
    return () => {
      window.removeEventListener(FEEDBACK_EVENT, onFeedback);
      for (const timer of activeTimers.values()) window.clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);

  if (!messages.length) return null;
  return (
    <Toasts aria-label={locale === "ja" ? "操作通知" : "Operation notifications"}>
      {messages.map(message => (
        <Toast key={message.id} $kind={message.kind}
          role={message.kind === "error" ? "alert" : "status"}
          aria-live={message.kind === "error" ? "assertive" : "polite"}>
          <span>{message.message}</span>
          <Dismiss type="button"
            aria-label={locale === "ja" ? "通知を閉じる" : "Dismiss notification"}
            onClick={() => {
              const timer = timers.current.get(message.id);
              if (timer) window.clearTimeout(timer);
              timers.current.delete(message.id);
              setMessages(current => current.filter(item => item.id !== message.id));
            }}>×</Dismiss>
        </Toast>
      ))}
    </Toasts>
  );
}

const Toasts = styled.div`
  position: fixed;
  right: max(12px, env(safe-area-inset-right));
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
  max-width: min(420px, calc(100vw - 24px));
  pointer-events: none;
`;
const Toast = styled.div<{ $kind: "success" | "error" | "info" }>`
  display: flex;
  align-items: center;
  gap: var(--space-2);
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: var(--space-2);
  border-radius: var(--space-1);
  border: 1px solid ${({ $kind }) => $kind === "error" ? "var(--danger-500)" : "var(--neutral-500)"};
  background: var(--neutral-900);
  color: white;
  box-shadow: 0 8px 24px rgb(0 0 0 / 40%);
  pointer-events: auto;
`;
const Dismiss = styled.button`
  width: 32px;
  min-width: 32px;
  padding: 0;
  background: transparent;
  border: 0;
  color: inherit;
  font-size: 1.25rem;
`;
