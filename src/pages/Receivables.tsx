import { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { accountApi, type Account } from "../api/account";
import { ticketsApi, toTicket, type ApiTicket } from "../api/tickets";
import { ApiError } from "../api/client";
import PaymentModal from "../components/PaymentModal";
import { useI18n } from "../i18n";
import { useModal } from "../hooks/useModal";

const PAGE_SIZE = 50;
const STATUSES = ["outstanding", "partially_paid", "settled", "written_off"] as const;

function statusLabel(status: string, ja: boolean) {
    const labels: Record<string, [string, string]> = {
        outstanding: ["Needs collection", "未回収"],
        partially_paid: ["Partially collected", "一部回収"],
        settled: ["Settled", "回収済み"],
        written_off: ["Written off", "免除済み"],
    };
    return labels[status]?.[ja ? 1 : 0] ?? status;
}

export default function Receivables() {
    const { locale } = useI18n();
    const { openModal } = useModal();
    const ja = locale === "ja";
    const [items, setItems] = useState<ApiTicket[]>([]);
    const [account, setAccount] = useState<Account | null>(null);
    const [status, setStatus] = useState("unresolved");
    const [reason, setReason] = useState("");
    const [offset, setOffset] = useState(0);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [now] = useState(() => Date.now() / 1000);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const query = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) });
            if (status === "unresolved") {
                query.append("settlement_status", "outstanding");
                query.append("settlement_status", "partially_paid");
            } else {
                if (status !== "all") query.set("settlement_status", status);
            }
            if (reason) query.set("reason", reason);
            const result = await ticketsApi.receivables(`?${query.toString()}`);
            setItems(result.items);
            setTotal(result.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : (ja ? "未払い伝票を読み込めませんでした。" : "Could not load unpaid tickets."));
        } finally { setLoading(false); }
    }, [ja, offset, reason, status]);

    useEffect(() => {
        const initial = window.setTimeout(() => void refresh(), 0);
        return () => window.clearTimeout(initial);
    }, [refresh]);
    useEffect(() => {
        let active = true;
        accountApi.me().then(value => { if (active) setAccount(value); }).catch(() => { if (active) setAccount(null); });
        const onRefresh = () => { void refresh(); };
        window.addEventListener("barticket-receivables-updated", onRefresh);
        window.addEventListener("focus", onRefresh);
        return () => { active = false; window.removeEventListener("barticket-receivables-updated", onRefresh); window.removeEventListener("focus", onRefresh); };
    }, [refresh]);

    const reload = () => { window.dispatchEvent(new Event("barticket-receivables-updated")); };
    const yen = (value: number) => "¥" + value.toLocaleString("ja-JP");
    const unresolved = status === "unresolved";
    const reasonOptions = [
        ["walkout", ja ? "支払い前に退店" : "Left without paying"],
        ["failed_payment", ja ? "決済失敗" : "Payment failed"],
        ["terminal_outage", ja ? "端末・通信障害" : "Terminal or network outage"],
        ["pay_later", ja ? "後払いの合意" : "Agreed to pay later"],
        ["disputed_bill", ja ? "会計内容に異議" : "Payment dispute"],
        ["staff_oversight", ja ? "スタッフの対応漏れ" : "Staff oversight"],
        ["other", ja ? "その他" : "Other"],
    ];

    return <main style={{ maxWidth: 1000, margin: "0 auto", padding: "var(--space-3)" }}>
        <h1>{ja ? "未払い・繰越伝票" : "Outstanding / unpaid tickets"}</h1>
        <p>{ja
            ? "サービス営業日、実際の回収額、残高を分けて表示します。後日の支払いは元のシフトや来店人数を変更しません。"
            : "Service date, actual collections, and remaining balance are shown separately. Later payments do not change the original shift or attendance."}</p>
        <FilterRow aria-label={ja ? "未払い伝票の絞り込み" : "Filter receivables"}>
            <label>{ja ? "状態" : "Status"}
                <select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}>
                    <option value="unresolved">{ja ? "未回収・一部回収" : "Needs collection (unpaid or partial)"}</option>
                    <option value="all">{ja ? "すべて" : "All receivables"}</option>
                    {STATUSES.map(value => <option key={value} value={value}>{statusLabel(value, ja)}</option>)}
                </select>
            </label>
            {!unresolved ? <label>{ja ? "理由" : "Reason"}
                <select value={reason} onChange={event => { setReason(event.target.value); setOffset(0); }}>
                    <option value="">{ja ? "すべて" : "All reasons"}</option>
                    {reasonOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
            </label> : null}
            <button type="button" className="hollow secondary" onClick={reload} disabled={loading}>{ja ? "更新" : "Refresh"}</button>
        </FilterRow>
        {loading ? <p role="status">{ja ? "未払い伝票を読み込み中…" : "Loading receivables…"}</p> : null}
        {error ? <div role="alert"><p>{error}</p><button type="button" onClick={reload}>{ja ? "再試行" : "Retry"}</button></div> : null}
        {!loading && !error ? <ResultsCount role="status">{ja ? `該当 ${total} 件` : `${total} receivable${total === 1 ? "" : "s"}`}</ResultsCount> : null}
        {!loading && !error && items.length === 0 ? <EmptyState role="status">
            <strong>{ja ? "該当する伝票はありません" : "No receivables match these filters."}</strong>
            <span>{ja ? "状態や理由の条件を確認してください。" : "Try a different status or reason filter."}</span>
            {status !== "unresolved" || reason ? <button type="button" className="small hollow secondary"
                onClick={() => { setStatus("unresolved"); setReason(""); setOffset(0); }}>
                {ja ? "未回収の表示に戻す" : "Show unpaid balances"}
            </button> : null}
        </EmptyState> : null}
        <List>
            {items.map(ticket => {
                const converted = toTicket(ticket);
                const isUnresolved = ticket.settlement_status === "outstanding" || ticket.settlement_status === "partially_paid";
                const ageDays = ticket.deferred_at ? Math.max(0, Math.floor((now - ticket.deferred_at) / 86400)) : null;
                return <ReceivableCard key={ticket.id}>
                    <header><div><h2>{ticket.name || `#${ticket.id}`} · #{ticket.id}</h2>
                        <p>{ja ? "サービス営業日" : "Service date"}: {ticket.service_business_date ?? "—"}
                            {ageDays !== null ? ` · ${ja ? "経過" : "Age"}: ${ageDays} ${ja ? "日" : "days"}` : ""}
                            {ticket.follow_up_date ? ` · ${ja ? "フォロー" : "Follow-up"}: ${ticket.follow_up_date}` : ""}</p>
                    </div><StatusBadge>{statusLabel(ticket.settlement_status ?? "outstanding", ja)}</StatusBadge></header>
                    <dl>
                        <dt>{ja ? "請求額" : "Billed"}</dt><dd>{yen(ticket.total)}</dd>
                        <dt>{ja ? "回収済み" : "Collected"}</dt><dd>{yen(ticket.amount_paid ?? 0)}</dd>
                        <dt><strong>{ja ? "残高" : "Balance due"}</strong></dt><dd><strong>{yen(ticket.balance_due ?? 0)}</strong></dd>
                        <dt>{ja ? "理由" : "Reason"}</dt><dd>{ticket.unpaid_reason ?? "—"}</dd>
                        {ticket.unpaid_note ? <><dt>{ja ? "スタッフメモ" : "Staff note"}</dt><dd>{ticket.unpaid_note}</dd></> : null}
                        {ticket.deferred_by ? <><dt>{ja ? "記録者" : "Recorded by"}</dt><dd>{ticket.deferred_by}</dd></> : null}
                    </dl>
                    <details><summary>{ja ? "品目・回収履歴・監査記録" : "Items, collection history, and audit trail"}</summary>
                        <ul>{converted.items.map((item, index) => <li key={`${item.id}-${index}`}>{item.name} × {item.quantity} — {yen(item.subtotal)}</li>)}</ul>
                        <ul>{(ticket.payments ?? []).map(payment => <li key={payment.id ?? `${payment.paid_at}-${payment.amount}`}>
                            {payment.type} · {yen(payment.amount)} · {payment.collection_business_date ?? "—"} · {payment.collected_by ?? "—"}
                            {payment.voided_at ? ` · ${ja ? "取消" : "Voided"} (${payment.void_reason ?? ""}; ${ja ? "返金ではありません" : "not a processor refund"})` : ""}
                            {account?.role === "manager" && payment.id && !payment.voided_at ? <VoidPaymentForm ticketId={ticket.id} paymentId={payment.id} locale={locale} onSaved={reload} /> : null}
                        </li>)}</ul>
                        {(ticket.write_offs ?? []).map((row, index) => <p key={index}>{ja ? "免除" : "Write-off"}: {yen(row.amount)} · {row.reason} · {row.written_off_by}</p>)}
                        {(ticket.receivable_history ?? []).map((row, index) => <p key={index}>{row.type} · {row.actor} · {new Date(row.created_at * 1000).toLocaleString(ja ? "ja-JP" : "en-US", { timeZone: "Asia/Tokyo" })} · {ja ? "残高" : "balance"} {yen(row.balance_after)}{row.reason ? ` · ${row.reason}` : ""}</p>)}
                    </details>
                    <ActionRow>
                        {isUnresolved ? <button type="button" onClick={() => openModal({
                            title: ja ? "後日の支払いを記録" : "Record later payment",
                            maxWidth: "560px",
                            content: <PaymentModal ticket={converted} onConfirm={async (method, amount, key) => {
                                if (!key) throw new Error("A retry-safe collection key is missing.");
                                await ticketsApi.pay(ticket.id, method, amount, key);
                                window.dispatchEvent(new Event("barticket-receivables-updated"));
                                return true;
                            }} />,
                        })}>{ja ? "支払いを記録" : "Record payment"}</button> : null}
                        {account?.role === "manager" && isUnresolved ? <WriteOffForm ticket={ticket} locale={locale} onSaved={reload} /> : null}
                    </ActionRow>
                </ReceivableCard>;
            })}
        </List>
        {total > PAGE_SIZE ? <ActionRow aria-label={ja ? "ページ移動" : "Pagination"}>
            <button type="button" disabled={offset <= 0 || loading} onClick={() => setOffset(value => Math.max(0, value - PAGE_SIZE))}>{ja ? "前へ" : "Previous"}</button>
            <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} / {total}</span>
            <button type="button" disabled={offset + PAGE_SIZE >= total || loading} onClick={() => setOffset(value => value + PAGE_SIZE)}>{ja ? "次へ" : "Next"}</button>
        </ActionRow> : null}
    </main>;
}

function WriteOffForm({ ticket, locale, onSaved }: { ticket: ApiTicket; locale: string; onSaved: () => void }) {
    const ja = locale === "ja";
    const { openModal } = useModal();
    const [idempotencyKey] = useState(() => crypto.randomUUID());
    return <button type="button" className="hollow danger" onClick={() => openModal({
        title: ja ? "未回収残高を免除" : "Write off unpaid balance",
        maxWidth: "520px",
        content: <WriteOffDialog ticket={ticket} locale={locale} onSaved={onSaved} idempotencyKey={idempotencyKey} />,
    })}>{ja ? "免除（管理者）" : "Write off (manager)"}</button>;
}

function WriteOffDialog({ ticket, locale, onSaved, idempotencyKey }: { ticket: ApiTicket; locale: string; onSaved: () => void; idempotencyKey: string }) {
    const ja = locale === "ja";
    const { closeModal } = useModal();
    const [amount, setAmount] = useState(String(ticket.balance_due ?? 0));
    const [reason, setReason] = useState("");
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const [attempted, setAttempted] = useState(false);
    const due = ticket.balance_due ?? 0;
    return <form onSubmit={async event => {
                event.preventDefault();
                const parsed = Number(amount);
                if (working || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > due || !reason.trim()) return;
                setAttempted(true); setWorking(true); setError("");
                try {
                    await ticketsApi.writeOff(ticket.id, { amount: parsed, reason: reason.trim() }, idempotencyKey);
                    closeModal(); onSaved();
                } catch (err) { setError(err instanceof ApiError ? err.message : (ja ? "結果が不明です。再送信せず伝票を確認してください。" : "Outcome unknown. Verify the ticket before any retry.")); }
                finally { setWorking(false); }
            }} style={{ display: "grid", gap: "var(--space-2)", padding: "var(--space-2)" }}>
                <p>{ja ? "これはPOSの監査記録で、カード返金は行いません。" : "This is an audited POS write-off; it does not refund a card payment."}</p>
                <label>{ja ? "免除額" : "Amount"}<input type="number" min={1} max={due} value={amount} onChange={event => setAmount(event.target.value)} disabled={working || attempted} /></label>
                <label>{ja ? "理由" : "Reason"}<textarea required maxLength={255} value={reason} onChange={event => setReason(event.target.value)} disabled={working || attempted} /></label>
                {error ? <p role="alert">{error}</p> : null}
                <button type="submit" className="danger" disabled={working}>{working ? (ja ? "保存中…" : "Saving…") : attempted
                    ? (ja ? "同じ記録を安全に再確認" : "Safely retry same write-off")
                    : (ja ? "免除を記録" : "Record write-off")}</button>
            </form>;
}

function VoidPaymentForm({ ticketId, paymentId, locale, onSaved }: { ticketId: number; paymentId: number; locale: string; onSaved: () => void }) {
    const ja = locale === "ja";
    const [reason, setReason] = useState("");
    const [working, setWorking] = useState(false);
    const [message, setMessage] = useState("");
    const submit = async () => {
        if (working || !reason.trim()) return;
        if (!window.confirm(ja ? "記録だけを取り消します。決済事業者への返金は行いません。続行しますか？" : "This only voids the POS record. It does not refund the processor. Continue?")) return;
        setWorking(true); setMessage("");
        try { await ticketsApi.voidPayment(ticketId, paymentId, reason.trim()); onSaved(); }
        catch (error) { setMessage(error instanceof ApiError ? error.message : (ja ? "結果が不明です。支払い履歴を更新してください。" : "Outcome unknown. Refresh payment history before acting again.")); }
        finally { setWorking(false); }
    };
    return <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
        <input aria-label={ja ? "取消理由" : "Void reason"} maxLength={255} value={reason} onChange={event => setReason(event.target.value)} placeholder={ja ? "取消理由" : "Correction reason"} />
        <button type="button" className="small hollow danger" disabled={working || !reason.trim()} onClick={() => void submit()}>{ja ? "取消記録" : "Void record"}</button>
        {message ? <small role="alert">{message}</small> : null}
    </span>;
}

const FilterRow = styled.div`display:grid; grid-template-columns:minmax(0,1fr); align-items:end; gap:var(--space-1); margin-block:var(--space-2); label{display:grid; gap:var(--space-1); min-width:0;} select{width:100%;} button{width:100%;} @media(min-width:600px){grid-template-columns:repeat(3,minmax(0,1fr)); button{width:auto;}}`;
const ResultsCount = styled.p`color:var(--neutral-300); font-family:var(--font-family-data); margin:0 0 var(--space-1);`;
const EmptyState = styled.section`display:flex;flex-direction:column;align-items:flex-start;gap:var(--space-1);padding:var(--space-2);background:var(--neutral-900);border-radius:12px;color:var(--neutral-300);strong{color:var(--neutral-100);}button{width:auto;}`;
const StatusBadge = styled.strong`display:inline-flex;padding:.25rem .7rem;border-radius:999px;background:var(--neutral-800);color:var(--neutral-100);font-size:var(--font-size-small);`;
const List = styled.section`display:grid; gap:var(--space-2);`;
const ReceivableCard = styled.article`border:1px solid var(--neutral-700); border-radius:var(--space-2); padding:var(--space-2); display:grid; gap:var(--space-2); overflow-wrap:anywhere; header{display:flex; justify-content:space-between; gap:var(--space-2); flex-wrap:wrap;} h2{font-size:var(--font-size-h4); margin:0;} p{margin:var(--space-1) 0;} dl{display:grid; grid-template-columns:minmax(8rem, 1fr) auto; gap:var(--space-1); margin:0;} dt,dd{margin:0;} dd{text-align:right;} details{min-width:0;} summary{cursor:pointer;} ul{padding-left:1.25rem;}`;
const ActionRow = styled.div`display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:var(--space-1);`;
