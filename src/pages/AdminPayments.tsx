import { useEffect, useState } from "react";
import styled from "styled-components";
import { apiRequest, getToken } from "../api/client";
type Setup = { provider: string; channel: string; methods: string[]; revision: number };

const providers = [
  { id: "unknown", name: "Other / Unknown · その他・不明", url: "", en: "Check the name on your terminal or settlement statement first.", ja: "まず端末または入金明細で決済会社名を確認してください。" },
  { id: "stripe", name: "Stripe", url: "https://stripe.com/jp/pricing", en: "Web checkout candidate: cards, Apple Pay, Google Pay and PayPay. Rakuten Pay requires early-access approval. Merchant review applies.", ja: "オンライン決済の候補：カード、Apple Pay、Google Pay、PayPay。楽天ペイは先行提供の承認が必要です。加盟店審査があります。" },
  { id: "square", name: "Square", url: "https://squareup.com/jp/ja/payments/pricing", en: "Online links support cards, Apple Pay and Google Pay. Terminal and online rates differ; confirm the product and contract.", ja: "オンラインリンクはカード、Apple Pay、Google Payに対応。対面とオンラインでは料金が異なるため、商品と契約を確認してください。" },
  { id: "airpay", name: "Airペイ", url: "https://airregi.jp/payment/service/online/", en: "Offers online payment through its own management screen. Automatic BarTicket integration is not confirmed.", ja: "専用管理画面からオンライン決済を利用できます。BarTicketとの自動連携は未確認です。" },
  { id: "paypay", name: "PayPay", url: "https://paypay.ne.jp/store-online/", en: "Online merchant setup is separate from assuming an existing shop QR contract supports web payments.", ja: "店舗用QRの契約だけでオンライン決済が使えるとは限りません。オンライン加盟店の利用条件を確認してください。" },
  { id: "rakuten", name: "楽天ペイ", url: "https://checkout.rakuten.co.jp/biz/service/price.html", en: "Online payments require the applicable merchant agreement; confirm rates and supported integration.", ja: "オンライン決済の加盟店契約が必要です。手数料と連携方法を確認してください。" },
];

export default function AdminPayments({ locale }: { locale: string }) {
  const ja = locale === "ja";
  const [providerId, setProviderId] = useState("unknown");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [channel, setChannel] = useState("online");
  const [methods, setMethods] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    apiRequest<Setup>("/admin/payment-setup").then(data => {
      if (cancelled || getToken() !== token) return;
      setSetup(data); setProviderId(data.provider); setChannel(data.channel); setMethods(data.methods);
    }).catch(() => { if (!cancelled && getToken() === token) setMessage(ja ? "保存設定を読み込めません。所有者の権限と接続を確認してください。" : "Saved setup unavailable. Check owner access and connection."); });
    return () => { cancelled = true; };
  }, [ja]);
  async function save() {
    if (!setup || busy) return;
    const token = getToken();
    setBusy(true); setMessage("");
    try {
      const data = await apiRequest<Setup>("/admin/payment-setup", {method: "PUT", body: {provider: providerId, channel, methods, revision: setup.revision}});
      if (getToken() !== token) return;
      setSetup(data); setMessage(ja ? "希望を保存しました。決済はまだ有効ではありません。" : "Preferences saved. Payments are not enabled.");
    } catch {
      if (getToken() !== token) return;
      setMessage(ja ? "保存を確認できません。ページを再読み込みして確認してください。" : "Save could not be confirmed. Reload to check the latest setup before retrying.");
      setSetup(null);
    } finally { setBusy(false); }
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
  return <Panel>
    <header><h2>{t("Payment setup", "決済設定")}</h2>
      <p>{t("Start with Nori’s existing provider", "まずNoriの現在の決済会社を確認")}</p></header>
    <Status role="status">{t("Payment processing: not connected", "決済処理：未接続")}</Status>
    <p>{t("Save your provider and preferred methods here. Complete merchant registration with the provider; registration alone does not connect BarTicket.", "決済会社と希望する支払方法を保存できます。加盟店登録は決済会社で行います。登録だけではBarTicketは接続されません。")}</p>
    <label>{t("Current or proposed provider", "現在または検討中の決済会社")}
      <select disabled={busy} value={providerId} onChange={e => setProviderId(e.target.value)}>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </label>
    <p>{ja ? provider.ja : provider.en}</p>
    {provider.url && <a href={provider.url} target="_blank" rel="noopener noreferrer">{t("View official options and fees ↗", "公式のサービス・料金を見る ↗")}</a>}
    <label>{t("Payment channel", "決済方式")}<select disabled={busy} value={channel} onChange={e => setChannel(e.target.value)}><option value="online">{t("Customer phone / online checkout", "お客様のスマホ・オンライン決済")}</option><option value="terminal">{t("In-person terminal", "対面端末")}</option></select></label>
    <fieldset disabled={busy}><legend>{t("Requested payment methods", "希望する支払方法")}</legend>{["card", "apple_pay", "google_pay", "paypay", "rakuten_pay"].map(method => <label key={method}><span><input style={{width:"auto"}} type="checkbox" checked={methods.includes(method)} onChange={e => setMethods(current => e.target.checked ? [...current, method] : current.filter(m => m !== method))} /> {{card: ja ? "カード" : "Cards", apple_pay: "Apple Pay", google_pay:"Google Pay", paypay:"PayPay", rakuten_pay:"楽天ペイ"}[method]}</span></label>)}</fieldset>
    <p>{t("Availability depends on your provider, payment channel and merchant approval.", "利用可否は決済会社、決済方式、加盟店審査によります。")}</p>
    <button type="button" disabled={!setup || busy} onClick={() => void save()}>{busy ? t("Saving…", "保存中…") : t("Save setup preferences", "設定の希望を保存")}</button>
    {message && <p role="status">{message}</p>}
    {onboardingUrl && <a href={onboardingUrl} target="_blank" rel="noopener noreferrer">{t("Continue setup with provider ↗", "決済会社で登録を進める ↗")}</a>}
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

const Panel = styled.section`
  max-width: 960px; display: grid; gap: var(--space-2);
  padding: var(--space-3); background: var(--neutral-900); border-radius: var(--space-2);
  h2, h3, p { margin: 0; } h3 { margin-top: var(--space-2); }
  label { display: grid; gap: var(--space-1); min-width: 0; }
  input, select { width: 100%; min-width: 0; box-sizing: border-box; font-size: 16px; }
  a { color: var(--primary-300, #a8bcff); } li { margin-bottom: var(--space-1); }
  output { font-size: 1.2rem; font-weight: 600; }
`;
const Status = styled.p`padding: var(--space-2); border: 1px solid var(--neutral-600); border-radius: var(--space-1);`;
const Fields = styled.div`display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); @media(max-width: 768px) { grid-template-columns: 1fr; }`;
