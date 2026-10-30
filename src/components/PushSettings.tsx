import { useEffect, useState } from "react";
import styled from "styled-components";
import { disablePush, enablePush, getPushEnabled, getPushPublicKey, PushRequestError, supportsPush } from "../api/push";
import { useI18n } from "../i18n";

type Availability = "checking" | "ready" | "unavailable" | "unsupported" | "error";

function isAppleMobileDevice(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export default function PushSettings() {
  const { locale } = useI18n();
  const ja = locale === "ja";
  const [enabled, setEnabled] = useState(false);
  const [availability, setAvailability] = useState<Availability>(() => supportsPush() ? "checking" : "unsupported");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checkVersion, setCheckVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function check() {
      if (!supportsPush()) return;
      try {
        const subscriptionExists = await getPushEnabled();
        if (!active) return;
        setEnabled(subscriptionExists);
        if (subscriptionExists) {
          setAvailability("ready");
          return;
        }
        const publicKey = await getPushPublicKey();
        if (active) setAvailability(publicKey ? "ready" : "unavailable");
      } catch {
        if (active) setAvailability("error");
      }
    }
    void check();
    return () => { active = false; };
  }, [checkVersion]);

  const supported = supportsPush();
  const showAppleInstallGuide = !supported && isAppleMobileDevice();
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
      {showAppleInstallGuide ? (
        <InstallGuide>
          <h4>{ja ? "iPhoneで通知を使う準備" : "Set up notifications on iPhone or iPad"}</h4>
          <ol>
            <li>{ja ? "Safariでこのページを開きます。" : "Open this page in Safari."}</li>
            <li>{ja ? "画面下の共有ボタン（四角から上向き矢印）をタップします。" : "Tap Share — the button that looks like a square with an arrow pointing up."}</li>
            <li>{ja ? "「ホーム画面に追加」をタップし、右上の「追加」をタップします。" : "Tap “Add to Home Screen,” then tap “Add” in the top corner."}</li>
            <li>{ja ? "ホーム画面にできたBarTicketのアイコンを開きます。" : "Open the new BarTicket icon on your Home Screen."}</li>
            <li>{ja ? "この画面に戻り、「この端末で通知を有効にする」をタップして「許可」を選びます。" : "Return here, tap “Enable notifications,” then tap “Allow.”"}</li>
          </ol>
          <p>{ja
            ? "すでにホーム画面にBarTicketのアイコンがある場合は、削除せず、そのアイコンから開いて通知を有効にしてください。iOSまたはiPadOS 16.4以降が必要です。"
            : "Already have a BarTicket icon on your Home Screen? Keep it. Open that icon and enable notifications; you don’t need to delete or reinstall it. Push requires iOS or iPadOS 16.4 or later."}</p>
        </InstallGuide>
      ) : null}
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
          <RetryButton type="button" onClick={() => {
            setAvailability("checking");
            setError("");
            setCheckVersion(version => version + 1);
          }}>
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

const InstallGuide = styled.div`
  min-width: 0;
  padding: var(--space-1);
  background: var(--neutral-800);
  border: 1px solid var(--neutral-600);
  border-radius: 8px;
  h4 { margin: 0 0 var(--space-0); font-size: var(--font-size-default); }
  ol { margin: 0; padding-left: 1.35rem; }
  li { padding-left: 2px; }
  li + li { margin-top: 6px; }
  p { margin: var(--space-1) 0 0; color: var(--neutral-300); }
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
