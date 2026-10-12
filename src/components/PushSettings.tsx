import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushEnabled, supportsPush } from "../api/push";

export default function PushSettings() {
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
    <section aria-label="Push notification settings">
      <h3>Device push notifications</h3>
      <p>Get alerts for tickets, staff drinks, clock-outs, shift closures, and stock changes.</p>
      {!supported ? <p>Push notifications aren't available in this browser. On iPhone, use Safari's Share menu to Add to Home Screen, then open BarTicket from your Home Screen.</p> : null}
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
      >{busy ? "Saving…" : enabled ? "Disable push on this device" : "Enable push on this device"}</button>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
