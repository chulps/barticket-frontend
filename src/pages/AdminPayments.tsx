import { useState } from "react";
import styled from "styled-components";

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
  const [sales, setSales] = useState("");
  const [rate, setRate] = useState("");
  const [fixed, setFixed] = useState("");
  const provider = providers.find(p => p.id === providerId)!;
  const inputs = [sales, rate, fixed];
  const valid = inputs.every(v => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) && Number(rate) <= 100;
  const cost = valid ? Number(sales) * Number(rate) / 100 + Number(fixed) : null;
  const t = (en: string, jp: string) => ja ? jp : en;
  return <Panel>
    <header><h2>{t("Payment setup", "決済設定")}</h2>
      <p>{t("Start with Nori’s existing provider", "まずNoriの現在の決済会社を確認")}</p></header>
    <Status role="status">{t("Setup guide • BarTicket payment processing is not connected", "設定ガイド・BarTicketの決済処理は未接続")}</Status>
    <p>{t("These choices are temporary planning inputs. They do not save an account, connect a provider or enable payments.", "ここでの選択は一時的な検討用です。アカウントの保存、決済会社との接続、決済の有効化は行われません。")}</p>
    <label>{t("Current or proposed provider", "現在または検討中の決済会社")}
      <select value={providerId} onChange={e => setProviderId(e.target.value)}>{providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </label>
    <p>{ja ? provider.ja : provider.en}</p>
    {provider.url && <a href={provider.url} target="_blank" rel="noopener noreferrer">{t("View official options and fees ↗", "公式のサービス・料金を見る ↗")}</a>}
    <h3>{t("Compare your actual quote", "実際の契約料金で比較")}</h3>
    <p>{t("Use tax-inclusive fees for the same payment channel. Online and in-person rates are not interchangeable. Include hardware and other charges separately.", "同じ決済方式の税込手数料で比較してください。オンラインと対面の料率は異なります。端末代などは別途考慮してください。")}</p>
    <Fields>
      <label>{t("Monthly processed sales (¥)", "月間決済額（円）")}<input type="number" min="0" step="1" value={sales} onChange={e => setSales(e.target.value)} /></label>
      <label>{t("Quoted fee (%)", "契約手数料（%）")}<input type="number" min="0" max="100" step="0.01" value={rate} onChange={e => setRate(e.target.value)} /></label>
      <label>{t("Monthly fixed fee (¥)", "月額固定費（円）")}<input type="number" min="0" step="1" value={fixed} onChange={e => setFixed(e.target.value)} /></label>
    </Fields>
    <output aria-live="polite">{t("Estimated monthly processing cost: ", "月間手数料の概算：")}{cost !== null && Number.isFinite(cost) ? `¥${Math.round(cost).toLocaleString(ja ? "ja-JP" : "en-US")}` : "—"}</output>
    <h3>{t("What Nori needs next", "次にNoriが用意するもの")}</h3>
    <ol>
      <li>{t("Confirm the existing provider, merchant agreement and fees.", "現在の決済会社、加盟店契約、手数料を確認。")}</li>
      <li>{t("Choose customer phone checkout or an in-person terminal connection.", "お客様のスマホ決済か、対面端末との連携かを選択。")}</li>
      <li>{t("Complete business verification and payout bank details directly with the provider.", "事業者確認と入金口座の登録は決済会社で直接手続き。")}</li>
      <li>{t("Connect the approved account and verify test payments before enabling live processing in BarTicket.", "承認済みアカウントを接続し、テスト決済を確認してからBarTicketで本番決済を有効化。")}</li>
    </ol>
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
