import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushEnabled, supportsPush } from "../api/push";
import { useI18n } from "../i18n";

export default function PushSettings() {
  const { locale } = useI18n();
  const ja = locale === "ja";
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getPushEnabled().then((value) => { if (active) setEnabled(value); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const supported = supportsPush();
  return (
    <section aria-label={ja ? "プッシュ通知の設定" : "Push notification settings"}>
      <h3>{ja ? "端末のプッシュ通知" : "Device push notifications"}</h3>
      <p>{ja ? "伝票、スタッフドリンク、退勤、営業終了、在庫変更のお知らせを受け取ります。" : "Get alerts for tickets, staff drinks, clock-outs, shift closures, and stock changes."}</p>
      {!supported ? <p>{ja ? "このブラウザーではプッシュ通知を利用できません。iPhoneではSafariの共有メニューからホーム画面に追加し、ホーム画面のBarTicketを開いてください。" : "Push notifications aren't available in this browser. On iPhone, use Safari's Share menu to Add to Home Screen, then open BarTicket from your Home Screen."}</p> : null}
      <button
        type="button"
        disabled={!supported || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            if (enabled) await disablePush();
            else await enablePush();
            setEnabled(!enabled);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally { setBusy(false); }
        }}
      >{busy ? (ja ? "保存中…" : "Saving…") : enabled ? (ja ? "この端末の通知を無効にする" : "Disable push on this device") : (ja ? "この端末の通知を有効にする" : "Enable push on this device")}</button>
      {error ? <p role="alert">{ja ? "通知設定を更新できませんでした。もう一度お試しください。" : error}</p> : null}
    </section>
  );
}
