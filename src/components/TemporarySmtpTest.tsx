/** Temporary manual, one-attempt control. Server enforces active-manager access and one-use claim. */
import { useRef, useState } from "react";
import { apiRequest } from "../api/client";

type Outcome = { status: "accepted_by_smtp_check_inbox" | "attempted_check_inbox" | "already_attempted" };

export default function TemporarySmtpTest({ locale }: { locale: string }) {
    const attempted = useRef(false);
    const [phase, setPhase] = useState<"ready" | "sending" | "check">("ready");
    const [result, setResult] = useState<Outcome["status"] | "unknown">("unknown");
    async function sendOnce() {
        if (attempted.current) return;
        attempted.current = true;
        setPhase("sending");
        try {
            const result = await apiRequest<Outcome>("/internal/one-off-smtp-test", { method: "POST" });
            setResult(result.status);
        } catch {
            // A request may have reached the server; never automatically retry.
            setResult("unknown");
        } finally {
            setPhase("check");
        }
    }
    return <section aria-label={locale === "ja" ? "メール送信テスト" : "Email sender test"}>
        <p>{locale === "ja" ? "info.rockbarfxxkup@gmail.com にテストメールを1通送信します。予約は作成されません。" : "Send one test email to info.rockbarfxxkup@gmail.com. No booking will be created."}</p>
        <button type="button" className="small secondary" disabled={phase !== "ready"} onClick={() => void sendOnce()}>
            {locale === "ja" ? "テストメールを送信" : "Send test email"}
        </button>
        {phase === "sending" ? <p role="status">{locale === "ja" ? "送信中…" : "Sending…"}</p> : null}
        {phase === "check" ? <p role="status">{result === "accepted_by_smtp_check_inbox"
            ? (locale === "ja" ? "メールサーバーが受け付けました。受信箱と迷惑メールを確認してください。再送しないでください。" : "The mail server accepted the test. Check the inbox and spam folder; do not resend.")
            : result === "already_attempted"
                ? (locale === "ja" ? "このテストは既に実行されています。受信箱と迷惑メールを確認し、再送しないでください。" : "This test was already attempted. Check the inbox and spam folder; do not resend.")
                : (locale === "ja" ? "送信結果を確認できません。受信箱と迷惑メールを確認し、再送しないでください。" : "The result could not be confirmed. Check the inbox and spam folder; do not resend.")}</p> : null}
    </section>;
}
