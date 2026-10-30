import { useCallback, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { disablePush, enablePush, getPushEnabled, getPushPublicKey, PushRequestError, supportsPush } from "../api/push";
import { useI18n } from "../i18n";

type Availability = "checking" | "ready" | "unavailable" | "unsupported" | "error";

export default function PushSettings() {
  const { locale } = useI18n();
  const ja = locale === "ja";
  const [enabled, setEnabled] = useState(false);
  const [availability, setAvailability] = useState<Availability>(() => supportsPush() ? "checking" : "unsupported");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(false);

  const checkAvailability = useCallback(async () => {
    if (!supportsPush()) return;
    try {
      const subscriptionExists = await getPushEnabled();
      if (!mounted.current) return;
      setEnabled(subscriptionExists);
      if (subscriptionExists) {
        setAvailability("ready");
        return;
      }
      const publicKey = await getPushPublicKey();
      if (mounted.current) setAvailability(publicKey ? "ready" : "unavailable");
    } catch {
      if (mounted.current) setAvailability("error");
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void checkAvailability();
    return () => { mounted.current = false; };
  }, [checkAvailability]);

  const supported = supportsPush();
  const canEnable = enabled || availability === "ready";
  const statusText = availability === "checking"
    ? (ja ? "通知の利用状況を確認しています…" : "Checking notification availability…")
    : availability === "unavailable"
      ? (ja ? "サーバー側の設定が完了するまで、この端末では通知を有効にできません。" : "Push isn’t set up on the server yet. This device won’t ask for notification permission until setup is complete.")
      : availability === "unsupported"
        ? (ja ? "このブラウザーではプッシュ通知を利用できません。iPhoneではSafariの共有メニューからホーム画面に追加し、ホーム画面のBarTicketを開いてください。" : "Push isn’t available in this browser. On iPhone, add BarTicket to your Home Screen from Safari, then open it there.")
        : availability === "error"
          ? (ja ? "通知の利用状況を確認できませんでした。接続を確認して再試行してください。" : "Couldn’t check notification availability. Check your connection and try again.")
          : enabled
            ? (ja ? "この端末では通知が有効です。" : "Notifications are enabled on this device.")
            : (ja ? "この端末で通知を有効にできます。" : "Push is ready to enable on this device.");

  return (
    <Panel aria-label={ja ? "プッシュ通知の設定" : "Push notification settings"}>
      <Heading>
        <div>
          <h3>{ja ? "端末のプッシュ通知" : "Device push notifications"}</h3>
          <p>{ja ? "この端末でBarTicketの通知を受け取ります。" : "Receive BarTicket alerts on this device."}</p>
        </div>
      </Heading>
      <Status role="status" data-state={availability}>
        <StatusDot aria-hidden="true" />
        <span>{statusText}</span>
      </Status>
      {error ? <Error role="alert">{error}</Error> : null}
      <Actions>
        <ActionButton
          type="button"
          disabled={!supported || availability === "checking" || !canEnable || busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              if (enabled) {
                await disablePush();
                setEnabled(false);
              } else {
                await enablePush();
                setEnabled(true);
              }
              setAvailability("ready");
            } catch (err) {
              if (err instanceof PushRequestError && err.status === 503) {
                setAvailability("unavailable");
              } else {
                setError(ja ? "通知設定を更新できませんでした。接続と端末の通知設定を確認してください。" : "Couldn’t update notification settings. Check your connection and device notification settings.");
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy
            ? (ja ? "更新中…" : "Updating…")
            : enabled
              ? (ja ? "この端末の通知をオフにする" : "Turn off on this device")
              : (ja ? "この端末で通知を有効にする" : "Enable notifications")}
        </ActionButton>
        {(availability === "unavailable" || availability === "error") && !enabled ? (
          <RetryButton type="button" onClick={() => { setAvailability("checking"); setError(""); void checkAvailability(); }}>
            {ja ? "再確認" : "Check again"}
          </RetryButton>
        ) : null}
      </Actions>
    </Panel>
  );
}

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: var(--space-2);
  margin: 0 0 var(--space-2);
  background: var(--neutral-900);
  border: 1px solid var(--neutral-700);
  border-radius: 12px;
  overflow-wrap: anywhere;
`;

const Heading = styled.div`
  min-width: 0;
  h3 { margin: 0; }
  p { margin: 4px 0 0; color: var(--neutral-300); }
`;

const Status = styled.div`
  display: flex;
  align-items: flex-start;
  gap: var(--space-0);
  min-width: 0;
  padding: var(--space-1);
  border-radius: 8px;
  background: var(--neutral-800);
  line-height: 1.45;
  span { min-width: 0; overflow-wrap: anywhere; }
  &[data-state="unavailable"], &[data-state="error"], &[data-state="unsupported"] {
    border: 1px solid var(--neutral-600);
  }
`;

const StatusDot = styled.span`
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 0.4em;
  border-radius: 50%;
  background: var(--royal-400);
  [data-state="unavailable"] &, [data-state="error"] &, [data-state="unsupported"] & {
    background: var(--neutral-400);
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-0);
  min-width: 0;
  @media (max-width: 560px) {
    flex-direction: column;
    align-items: stretch;
    button { width: 100%; white-space: normal; min-height: 48px; }
  }
`;

const ActionButton = styled.button`
  width: auto;
  min-width: min(100%, 240px);
  max-width: 100%;
  white-space: normal;
  line-height: 1.3;
`;

const RetryButton = styled.button`
  width: auto;
  white-space: normal;
`;

const Error = styled.p`
  margin: 0;
  color: var(--danger-400);
  overflow-wrap: anywhere;
`;
