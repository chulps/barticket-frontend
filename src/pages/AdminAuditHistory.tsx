import { useEffect, useState } from "react";
import styled from "styled-components";
import { accountApi, type Account, type AdminAuditEvent } from "../api/account";
import type { Locale } from "../i18n";

const actionLabels: Record<string, [string, string]> = {
    account_created: ["アカウントを追加", "Account added"],
    account_reactivated: ["アカウントを再開", "Account reactivated"],
    account_deactivated: ["アカウントを停止", "Account deactivated"],
    hourly_rate_added: ["時給を変更", "Hourly rate changed"],
    punch_corrected: ["打刻を修正", "Punch corrected"],
    historical_hours_imported: ["過去の勤務時間を登録", "Historical hours recorded"],
    historical_hours_clock_total_overridden: ["打刻時間を過去データで修正", "Historical hours corrected a clock total"],
    historical_hours_corrected: ["過去の勤務時間を修正", "Historical hours corrected"],
    historical_hours_rejected: ["過去の勤務時間を却下", "Historical hours rejected"],
    manager_pay_deduction_added: ["報酬控除を追加", "Pay deduction added"],
    manager_pay_deduction_reversed: ["報酬控除を取消", "Pay deduction reversed"],
    shift_manager_assignment_changed: ["担当マネージャーを変更", "Working manager changed"],
    shift_reopened: ["シフトを再開", "Shift reopened"],
    shift_kept_open: ["シフトを継続", "Shift kept open"],
};

export default function AdminAuditHistory({ person, locale, onBack }: {
    person: Account;
    locale: Locale;
    onBack: () => void;
}) {
    const ja = locale === "ja";
    const [events, setEvents] = useState<AdminAuditEvent[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loadedFor, setLoadedFor] = useState<number | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [error, setError] = useState("");
    const loading = loadedFor !== person.id && !error;

    useEffect(() => {
        let active = true;
        accountApi.adminAuditHistory(person.id).then(result => {
            if (!active) return;
            setEvents(result.events);
            setHasMore(result.has_more);
            setError("");
            setLoadedFor(person.id);
        }).catch(err => {
            if (!active) return;
            setError(err instanceof Error ? err.message : (locale === "ja" ? "履歴を読み込めませんでした" : "Could not load audit history"));
            setLoadedFor(person.id);
        });
        return () => { active = false; };
    }, [person.id, retryCount, locale]);

    return (
        <Page aria-label={ja ? "変更履歴" : "Audit history"}>
            <button className="small hollow secondary" type="button" onClick={onBack}>
                {ja ? "← チームプロフィールへ戻る" : "← Back to team profile"}
            </button>
            <h1>{ja ? "変更履歴" : "Audit history"}</h1>
            <p>{ja ? person.name + " の管理変更履歴" : "Administrative changes recorded for " + person.name}</p>
            {error ? <Notice role="alert">{error}<button type="button" className="small hollow secondary" onClick={() => { setError(""); setLoadedFor(null); setRetryCount(count => count + 1); }}>{ja ? "再試行" : "Retry"}</button></Notice> : null}
            {loading ? <Muted role="status">{ja ? "読み込み中…" : "Loading audit history…"}</Muted> : null}
            {!loading && !error && events.length === 0 ? <Card><p>{ja ? "記録された変更はありません。" : "No recorded changes for this team member."}</p></Card> : null}
            {events.map((event, index) => (
                <Card key={`${event.entity_type}-${event.entity_id}-${event.occurred_at}-${index}`}>
                    <header>
                        <h2>{actionLabels[event.action]?.[ja ? 0 : 1] ?? event.action.replaceAll("_", " ")}</h2>
                        <time dateTime={event.occurred_at}>{new Intl.DateTimeFormat(ja ? "ja-JP" : "en", {
                            dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tokyo",
                        }).format(new Date(event.occurred_at))} JST</time>
                    </header>
                    <p>{ja ? "実行者" : "Changed by"}: {event.actor_name}</p>
                    {event.reason ? <p>{ja ? "理由" : "Reason"}: {event.reason}</p> : null}
                    {event.before ? <Values title={ja ? "変更前" : "Before"} values={event.before} locale={locale} /> : null}
                    {event.after ? <Values title={ja ? "変更後" : "After"} values={event.after} locale={locale} /> : null}
                </Card>
            ))}
            {!loading && hasMore ? <Muted>{ja ? "最新200件のみ表示しています。" : "Only the latest 200 events are shown."}</Muted> : null}
        </Page>
    );
}

function Values({ title, values, locale }: { title: string; values: Record<string, unknown>; locale: Locale }) {
    const ja = locale === "ja";
    const labels: Record<string, [string, string]> = {
        name: ["名前", "Name"], role: ["権限", "Role"], active: ["有効", "Active"],
        hourly_rate_yen: ["時給", "Hourly rate"], effective_from: ["適用開始日", "Effective from"],
        clock_in: ["出勤時刻", "Clock in"], clock_out: ["退勤時刻", "Clock out"],
        business_date: ["営業日", "Business date"], duration_seconds: ["勤務時間（秒）", "Duration (seconds)"],
        verification_state: ["確認状態", "Verification"], supersedes_clock: ["打刻を置換", "Replaces punch hours"],
        category: ["分類", "Category"], signed_amount_yen: ["金額（円）", "Amount (JPY)"],
        reversal_of_id: ["取消元記録", "Reversed record"], manager_user_id: ["マネージャーID", "Manager ID"],
        manager_name: ["マネージャー", "Manager"], source: ["出典", "Source"],
        closed_at: ["閉店時刻", "Closed at"], paid_total_yen: ["支払済み合計", "Paid total (JPY)"],
        cash_total_yen: ["現金合計", "Cash total (JPY)"], card_total_yen: ["カード合計", "Card total (JPY)"],
        other_total_yen: ["PayPay・その他合計", "PayPay / other total (JPY)"], cover_total_yen: ["カバーチャージ", "Cover total (JPY)"],
        guest_count: ["来店人数", "Guest count"], paid_count: ["支払件数", "Paid count"],
        cancelled_count: ["キャンセル件数", "Cancelled count"], status: ["状態", "Status"],
    };
    return <ValuesList><strong>{title}</strong><dl>{Object.entries(values).map(([key, value]) => (
        <div key={key}><dt>{labels[key]?.[ja ? 0 : 1] ?? key.replaceAll("_", " ")}</dt><dd>{value === null ? "—" : typeof value === "boolean" ? (value ? (ja ? "はい" : "Yes") : (ja ? "いいえ" : "No")) : String(value)}</dd></div>
    ))}</dl></ValuesList>;
}

const Page = styled.main`
    display: flex; flex-direction: column; gap: var(--space-2); width: 100%;
    padding: var(--space-2) 0;
    h1 { font-size: var(--font-size-h3); }
    > button { width: auto; align-self: flex-start; }
`;
const Card = styled.section`
    display: flex; flex-direction: column; gap: var(--space-1);
    padding: var(--space-2); border-radius: 12px; background: var(--neutral-900);
    h2 { font-size: var(--font-size-h4); font-weight: 500; }
    header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--space-1); }
    time { color: var(--neutral-300); font-size: var(--font-size-small); }
`;
const Muted = styled.p`color: var(--neutral-300);`;
const Notice = styled.p`color: var(--danger-300); button { margin-left: var(--space-1); }`;
const ValuesList = styled.section`
    margin-top: var(--space-1);
    dl { margin: var(--space-1) 0 0; display: grid; gap: 6px; }
    dl > div { display: grid; grid-template-columns: minmax(130px, 1fr) 2fr; gap: var(--space-1); }
    dt { color: var(--neutral-300); }
    dd { margin: 0; overflow-wrap: anywhere; }
`;
