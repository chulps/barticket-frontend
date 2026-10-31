import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { ApiError, apiRequest, getToken } from "../api/client";
import { paymentSetupAccess } from "../api/paymentSetupAccess";
type Setup = { provider: string; channel: string; methods: string[]; revision: number };

const providers = [
  { id: "unknown", name: "Other / Unknown · その他・不明", url: "", en: "Check the name on your terminal or settlement statement first.", ja: "まず端末または入金明細で決済会社名を確認してください。" },
  { id: "stripe", name: "Stripe", url: "https://stripe.com/jp/pricing", en: "Recommended for customer phone checkout. Cards and eligible Apple Pay / Google Pay wallets; PayPay requires merchant review. Rakuten Pay requires early-access approval.", ja: "お客様のスマホ決済におすすめ。カードと利用条件を満たすApple Pay・Google Payに対応。PayPayは加盟店審査、楽天ペイは先行提供の承認が必要です。" },
  { id: "square", name: "Square", url: "https://squareup.com/jp/ja/payments/pricing", en: "Online links support cards, Apple Pay and Google Pay. Terminal and online rates differ; confirm the product and contract.", ja: "オンラインリンクはカード、Apple Pay、Google Payに対応。対面とオンラインでは料金が異なるため、商品と契約を確認してください。" },
  { id: "airpay", name: "Airペイ", url: "https://airregi.jp/payment/service/online/", en: "Offers online payment through its own management screen. Automatic BarTicket integration is not confirmed.", ja: "専用管理画面からオンライン決済を利用できます。BarTicketとの自動連携は未確認です。" },
  { id: "paypay", name: "PayPay", url: "https://paypay.ne.jp/store-online/", en: "Online merchant setup is separate from assuming an existing shop QR contract supports web payments.", ja: "店舗用QRの契約だけでオンライン決済が使えるとは限りません。オンライン加盟店の利用条件を確認してください。" },
  { id: "rakuten", name: "楽天ペイ", url: "https://checkout.rakuten.co.jp/biz/service/price.html", en: "Online payments require the applicable merchant agreement; confirm rates and supported integration.", ja: "オンライン決済の加盟店契約が必要です。手数料と連携方法を確認してください。" },
];

export default function AdminPayments({ locale, accessDenied = false, accessUnavailable = false, onAccessChecked }: { locale: string; accessDenied?: boolean; accessUnavailable?: boolean; onAccessChecked?: (allowed: boolean | null) => void }) {
  const ja = locale === "ja";
  const [providerId, setProviderId] = useState("unknown");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [channel, setChannel] = useState("online");
  const [methods, setMethods] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [needsReload, setNeedsReload] = useState(false);
  const [loadError, setLoadError] = useState<"denied" | "unavailable" | "">("");
  const [message, setMessage] = useState<"saved" | "uncertain" | "">("");
  const generation = useRef(0);
  const writePending = useRef(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const request = ++generation.current;
      const token = getToken();
      setSetup(null); setLoading(true); setLoadError(""); setMessage("");
      setNeedsReload(false); setBusy(false); writePending.current = false;
      if (!token || accessDenied) {
        setLoadError("denied"); setLoading(false);
        return;
      }
      let checkedAccess = false;
      try {
        const allowed = await paymentSetupAccess.read();
        if (cancelled || request !== generation.current || getToken() !== token) return;
        checkedAccess = true;
        onAccessChecked?.(allowed);
        if (!allowed) { setLoadError("denied"); return; }
        const data = await apiRequest<Setup>("/admin/payment-setup");
        if (cancelled || request !== generation.current || getToken() !== token) return;
        setSetup(data); setProviderId(data.provider); setChannel(data.channel); setMethods(data.methods);
      } catch (error) {
        if (cancelled || request !== generation.current || getToken() !== token) return;
        const denied = error instanceof ApiError && (error.status === 401 || error.status === 403);
        if (denied) onAccessChecked?.(false);
        else if (!checkedAccess) onAccessChecked?.(null);
        setLoadError(denied ? "denied" : "unavailable");
      } finally {
        if (!cancelled && request === generation.current && getToken() === token) setLoading(false);
      }
    }
    const reload = () => { void load(); };
    reload();
    window.addEventListener("barticket-auth", reload);
    return () => {
      cancelled = true;
      // Invalidate pending writes too; this counter is not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      window.removeEventListener("barticket-auth", reload);
    };
  }, [reloadKey, accessDenied, onAccessChecked]);
  async function save() {
    const token = getToken();
    if (accessDenied || accessUnavailable || !setup || loading || busy || writePending.current || needsReload || !token) return;
    const request = generation.current;
    writePending.current = true;
    setBusy(true); setMessage("");
    try {
      const data = await apiRequest<Setup>("/admin/payment-setup", {method: "PUT", body: {provider: providerId, channel, methods, revision: setup.revision}});
      if (request !== generation.current || getToken() !== token) return;
      setSetup(data); setMessage("saved");
    } catch (error) {
      if (request !== generation.current || getToken() !== token) return;
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setSetup(null); setLoadError("denied"); onAccessChecked?.(false);
      } else {
        setMessage("uncertain"); setNeedsReload(true);
      }
    } finally {
      if (request === generation.current && getToken() === token) {
        writePending.current = false; setBusy(false);
      }
    }
  }
  const [sales, setSales] = useState("");
  const [rate, setRate] = useState("");
  const [fixed, setFixed] = useState("");
  const provider = providers.find(p => p.id === providerId) ?? providers[0];
  const onboardingUrl = providerId === "stripe" ? "https://dashboard.stripe.com/register" : providerId === "square" ? "https://squareup.com/signup/jp" : provider.url;
  const inputs = [sales, rate, fixed];
  const valid = inputs.every(v => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) && Number(rate) <= 100;
  const cost = valid ? Number(sales) * Number(rate) / 100 + Number(fixed) : null;
  const t = (en: string, jp: string) => ja ? jp : en;
  if (accessDenied || accessUnavailable || loading || !setup) return <Panel>
    <h2>{t("Payment setup", "決済設定")}</h2>
    {loading && !accessDenied && !accessUnavailable ? <p role="status">{t("Checking payment setup access…", "決済設定の権限を確認中…")}</p> : <>
      <p role="alert">{accessDenied || loadError === "denied"
        ? t("Only the payment account owner can view or change saved payment settings.", "保存した決済設定は決済アカウントの所有者のみが確認・変更できます。")
        : t("Saved setup is unavailable. Check the connection and try again.", "保存した設定を読み込めません。接続を確認して再試行してください。")}</p>
      {!accessDenied && loadError !== "denied" ? <button type="button" onClick={() => { paymentSetupAccess.revalidate(); setReloadKey(key => key + 1); }}>{t("Reload saved setup", "保存した設定を再読み込み")}</button> : null}
    </>}
  </Panel>;
  const disabled = busy || needsReload;
  return <Panel>
    <header><h2>{t("Payment setup", "決済設定")}</h2>
      <p>{t("Set up Stripe for customer phone payments", "お客様のスマホ決済にStripeを設定")}</p></header>
    <Status role="status">{t("Payment processing: not connected", "決済処理：未接続")}</Status>
    <p>{t("Save your provider and preferred methods here. Complete merchant registration with the provider; registration alone does not connect BarTicket.", "決済会社と希望する支払方法を保存できます。加盟店登録は決済会社で行います。登録だけではBarTicketは接続されません。")}</p>
    <p>{t("Stripe is the recommended online option. You can keep your existing card terminal; choosing Stripe here only changes your setup preferences.", "オンライン決済にはStripeをおすすめします。現在のカード端末はそのまま使えます。ここでStripeを選んでも、設定の希望が変わるだけです。")}</p>
    {(providerId !== "stripe" || channel !== "online") && <button type="button" className="hollow secondary" disabled={disabled} onClick={() => { setProviderId("stripe"); setChannel("online"); }}>{t("Choose Stripe online setup", "Stripeのオンライン設定を選択")}</button>}
    <label>{t("Current or proposed provider", "現在または検討中の決済会社")}
      <select disabled={disabled} value={providerId} onChange={e => setProviderId(e.target.value)}>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </label>
    <p>{ja ? provider.ja : provider.en}</p>
    {provider.url && <a href={provider.url} target="_blank" rel="noopener noreferrer">{t("View official options and fees ↗", "公式のサービス・料金を見る ↗")}</a>}
    <label>{t("Payment channel", "決済方式")}<select disabled={disabled} value={channel} onChange={e => setChannel(e.target.value)}><option value="online">{t("Customer phone / online checkout", "お客様のスマホ・オンライン決済")}</option><option value="terminal">{t("In-person terminal", "対面端末")}</option></select></label>
    <fieldset disabled={disabled}><legend>{t("Requested payment methods", "希望する支払方法")}</legend>{["card", "apple_pay", "google_pay", "paypay", "rakuten_pay"].map(method => <label key={method}><span><input style={{width:"auto"}} type="checkbox" checked={methods.includes(method)} onChange={e => setMethods(current => e.target.checked ? [...current, method] : current.filter(m => m !== method))} /> {{card: ja ? "カード" : "Cards", apple_pay: "Apple Pay", google_pay:"Google Pay", paypay:"PayPay", rakuten_pay:"楽天ペイ"}[method]}</span></label>)}</fieldset>
    <p>{t("Availability depends on your provider, payment channel and merchant approval.", "利用可否は決済会社、決済方式、加盟店審査によります。")}</p>
    <button type="button" disabled={disabled} onClick={() => void save()}>{busy ? t("Saving…", "保存中…") : t("Save setup preferences", "設定の希望を保存")}</button>
    {message && <p role={message === "uncertain" ? "alert" : "status"}>{message === "saved"
      ? t("Preferences saved. Payments are not enabled.", "希望を保存しました。決済はまだ有効ではありません。")
      : t("Save could not be confirmed. Reload the saved setup before making another change. Your unsaved selections will be replaced.", "保存を確認できません。次の変更前に保存した設定を再読み込みしてください。未保存の選択内容は置き換わります。")}</p>}
    {needsReload ? <button type="button" onClick={() => setReloadKey(key => key + 1)}>{t("Reload saved setup", "保存した設定を再読み込み")}</button> : null}
    {providerId === "stripe" && channel === "online" && <StripeGuide ja={ja} />}
    {onboardingUrl && providerId !== "stripe" && <a href={onboardingUrl} target="_blank" rel="noopener noreferrer">{t("Continue setup with provider ↗", "決済会社で登録を進める ↗")}</a>}
    <details><summary>{t("Compare fees", "手数料を比較")}</summary>
    <h3>{t("Compare your actual quote", "実際の契約料金で比較")}</h3>
    <p>{t("Use tax-inclusive fees for the same payment channel. Online and in-person rates are not interchangeable. Include hardware and other charges separately.", "同じ決済方式の税込手数料で比較してください。オンラインと対面の料率は異なります。端末代などは別途考慮してください。")}</p>
    <Fields>
      <label>{t("Monthly processed sales (¥)", "月間決済額（円）")}<input type="number" min="0" step="1" value={sales} onChange={e => setSales(e.target.value)} /></label>
      <label>{t("Quoted fee (%)", "契約手数料（%）")}<input type="number" min="0" max="100" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></label>
      <label>{t("Monthly fixed fee (¥)", "月額固定費（円）")}<input type="number" min="0" step="1" value={fixed} onChange={e => setFixed(e.target.value)} /></label>
    </Fields>
    <output aria-live="polite">{t("Estimated monthly processing cost: ", "月間手数料の概算：")}{cost !== null && Number.isFinite(cost) ? `¥${Math.round(cost).toLocaleString(ja ? "ja-JP" : "en-US")}` : "—"}</output>
    </details>
    <details><summary>{t("Setup checklist", "設定チェックリスト")}</summary>
    <h3>{t("What Nori needs next", "次にNoriが用意するもの")}</h3>
    <ol>
      <li>{t("Confirm the existing provider, merchant agreement and fees.", "現在の決済会社、加盟店契約、手数料を確認。")}</li>
      <li>{t("Choose customer phone checkout or an in-person terminal connection.", "お客様のスマホ決済か、対面端末との連携かを選択。")}</li>
      <li>{t("Complete business verification and payout bank details directly with the provider.", "事業者確認と入金口座の登録は決済会社で直接手続き。")}</li>
      <li>{t("Connect the approved account and verify test payments before enabling live processing in BarTicket.", "承認済みアカウントを接続し、テスト決済を確認してからBarTicketで本番決済を有効化。")}</li>
    </ol>
    </details>
    <p>{t("Do not enter bank details, passwords or secret API keys here. Secure account connection is not available yet.", "銀行情報、パスワード、秘密APIキーはここに入力しないでください。安全なアカウント接続機能は準備中です。")}</p>
  </Panel>;
}

function StripeGuide({ ja }: { ja: boolean }) {
  const t = (en: string, jp: string) => ja ? jp : en;
  return <section aria-label={t("Stripe online setup", "Stripeのオンライン設定")}>
    <h3>{t("Next: prepare your Stripe account", "次のステップ：Stripeアカウントの準備")}</h3>
    <ol>
      <li>{t("Create a Stripe account for the bar, or sign in to its existing Stripe account. Complete business verification and payout details in Stripe.", "お店のStripeアカウントを作成、または既存のアカウントにログインし、Stripeで事業者確認と入金先の登録を完了してください。")}</li>
      <li>{t("Review payment methods in Stripe. Apple Pay and Google Pay depend on customer device and eligibility; PayPay needs approval. Rakuten Pay is early access, not guaranteed.", "Stripeで支払方法を確認してください。Apple Pay・Google Payは端末や利用条件によります。PayPayは審査が必要です。楽天ペイは先行提供のため、利用は保証されません。")}</li>
      <li>{t("Save these preferences, then have the BarTicket administrator arrange the secure Stripe connection and sandbox checks. Account registration alone does not enable ticket payments.", "この設定の希望を保存した後、BarTicket管理者に安全なStripe連携とテスト環境での確認を依頼してください。アカウント登録だけではチケットの決済は有効になりません。")}</li>
    </ol>
    <p><a href="https://dashboard.stripe.com/register" target="_blank" rel="noopener noreferrer">{t("Create a Stripe account ↗", "Stripeアカウントを作成 ↗")}</a>{" · "}<a href="https://dashboard.stripe.com/" target="_blank" rel="noopener noreferrer">{t("Open Stripe Dashboard ↗", "Stripeダッシュボードを開く ↗")}</a></p>
    <details><summary>{t("Payment method requirements", "支払方法の利用条件")}</summary>
      <p><a href="https://docs.stripe.com/payments/wallets" target="_blank" rel="noopener noreferrer">{t("Wallet requirements ↗", "ウォレットの利用条件 ↗")}</a>{" · "}<a href="https://support.stripe.com/questions/accepting-paypay-payments-for-japan-based-stripe-accounts" target="_blank" rel="noopener noreferrer">{t("PayPay review ↗", "PayPayの審査 ↗")}</a>{" · "}<a href="https://docs.stripe.com/payments/rakuten-pay" target="_blank" rel="noopener noreferrer">{t("Rakuten Pay early access ↗", "楽天ペイの先行提供 ↗")}</a></p>
    </details>
  </section>;
}

const Panel = styled.section`
  width:100%; min-width:0; box-sizing:border-box; max-width: 960px; display: grid; grid-template-columns:minmax(0, 1fr); gap: var(--space-2);
  padding: var(--space-3); background: var(--neutral-900); border-radius: var(--space-2);
  h2, h3, p { margin: 0; } h3 { margin-top: var(--space-2); }
  fieldset { min-width:0; margin:0; }
  a, p, button, summary { overflow-wrap:anywhere; }
  label { display: grid; gap: var(--space-1); min-width: 0; }
  input, select { width: 100%; min-width: 0; box-sizing: border-box; font-size: 16px; }
  a { color: var(--primary-300, #a8bcff); } li { margin-bottom: var(--space-1); }
  output { font-size: 1.2rem; font-weight: 600; }
`;
const Status = styled.p`padding: var(--space-2); border: 1px solid var(--neutral-600); border-radius: var(--space-1);`;
const Fields = styled.div`display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); @media(max-width: 768px) { grid-template-columns: 1fr; }`;
