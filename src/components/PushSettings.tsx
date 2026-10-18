import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushEnabled, supportsPush } from "../api/push";
import { useI18n } from "../i18n";

export default function PushSettings() {
  const { locale } = useI18n();
  const ja = locale === "ja";
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getPushEnabled().then((value) => {
        if (active) { setEnabled(value); setError(""); }
      }).catch(() => {
        if (active) { setEnabled(false); setError(ja ? "通知の登録状態を確認できませんでした。接続を確認して再度お試しください。" : "Could not verify notification registration. Check your connection and try again."); }
      }).finally(() => { if (active) setChecking(false); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("barticket-auth", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); window.removeEventListener("barticket-auth", refresh); };
  }, [ja]);

  const supported = supportsPush();
  const blocked = supported && Notification.permission === "denied";
  return (
    <section aria-label={ja ? "プッシュ通知設定" : "Push notification settings"}>
      <h3>{ja ? "この端末のプッシュ通知" : "Device push notifications"}</h3>
      <p>{ja ? "伝票、スタッフドリンク、出退勤、営業開始・終了、在庫の変更を通知します。" : "Get alerts for tickets, staff drinks, clock-ins and clock-outs, shift changes, and stock changes."}</p>
      {!supported ? <p>{ja ? "このブラウザではプッシュ通知を利用できません。iPhoneではSafariの共有メニューから「ホーム画面に追加」し、ホーム画面からアプリを開いてください。" : "Push notifications aren't available in this browser. On iPhone, use Safari's Share menu to Add to Home Screen, then open BarTicket from your Home Screen."}</p> : null}
      {blocked ? <p>{ja ? "通知がブロックされています。端末の設定でBarTicketの通知を許可してください。" : "Notifications are blocked. Allow BarTicket notifications in your device settings."}</p> : null}
      <button
        type="button"
        disabled={!supported || blocked || busy || checking}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (enabled) await disablePush();
            else await enablePush();
            setEnabled(await getPushEnabled());
          } catch (err) {
            setError(ja ? "通知設定を保存できませんでした。端末の通知許可と接続を確認してください。" : err instanceof Error ? err.message : String(err));
          } finally { setBusy(false); }
        }}
      >{busy || checking ? (ja ? "確認中…" : "Checking…") : enabled ? (ja ? "この端末のプッシュ通知を無効にする" : "Disable push on this device") : (ja ? "この端末のプッシュ通知を有効にする" : "Enable push on this device")}</button>
      {enabled ? <p role="status">{ja ? "この端末への通知が登録されています。" : "This device is registered for notifications."}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
