import styled from "styled-components";
import type { ReactNode } from "react";
import type { PaymentPlan } from "./paymentPlans";

type Props = {
    ja: boolean;
    selected?: PaymentPlan | null;
    onSelect?: (plan: PaymentPlan) => void;
    disabled?: boolean;
    selectionFooter?: ReactNode;
};

/** Public-to-managers comparison only: never fetches or writes saved settings. */
export default function PaymentDecisionGuide({ ja, selected = null, onSelect, disabled = false, selectionFooter }: Props) {
    const t = (en: string, jp: string) => ja ? jp : en;
    const choose = (plan: PaymentPlan) => onSelect ? <><Choose type="button" disabled={disabled}
        aria-pressed={selected === plan} onClick={() => onSelect(plan)}>
        {selected === plan ? t("Selected preference", "この方法を選択中") : t("Choose this preference", "この方法を希望する")}
    </Choose>{selected === plan ? selectionFooter : null}</> : null;
    return <Guide aria-label={t("Choose a payment approach", "支払い方法の選び方")}>
        <header>
            <h3>{t("What fits the bar best?", "お店には、どの方法が合う？")}</h3>
            <p>{t("For the easiest start, keep the current JMS terminal. Choose Square if taking payment on the shop’s phone matters more.", "まずは今のJMS端末を使うのがいちばん簡単。お店のスマホで受け付けたいなら、Squareを検討しましょう。")}</p>
        </header>
        <Notice>{t("No added customer fee. This is a comparison, not activation. Saving a preference does not connect or enable payments.", "お客様への追加手数料はありません。ここでは方法を比べて、希望を選びます。希望を保存しても決済の接続・有効化はしません。")}</Notice>
        <Cards>
            <Card $selected={selected === "current_jms"} aria-labelledby="payment-plan-current">
                <Badge>{t("Easiest today · recommended now", "いちばん簡単・今のおすすめ")}</Badge>
                <h4 id="payment-plan-current">{t("Keep the current JMS terminal", "今のJMS端末を使う")}</h4>
                <p>{t("Keep taking payments the usual way, then record the method in BarTicket.", "いつもの端末で支払いを受けて、BarTicketに記録します。")}</p>
                <Cost>{t("Cost: check the existing JMS contract.", "費用：今のJMS契約で確認")}</Cost>
                {choose("current_jms")}
                <details><summary>{t("Review requirements", "確認すること")}</summary>
                <ul>
                    <li>{t("No new payment app to learn.", "新しい決済アプリを覚えなくてOK。")}</li>
                    <li>{t("Paper receipts follow the current terminal’s settings.", "紙レシートは今の端末の設定どおり。")}</li>
                </ul>

                    <p>{t("This is manual recording, not an automatic connection. Verify the charged amount and record Cash, Credit card, PayPay, or Other after payment. Check customer-copy and shop-copy receipt settings on the terminal.", "自動連携ではなく、支払い後の記録です。金額を確認し、現金・クレジットカード・PayPay・その他を選んで記録します。お客様控え・店舗控えは端末の設定を確認してください。")}</p>
                    <a href="https://www.japanmerchantservices.com/merchant/guide/payment/" target="_blank" rel="noopener noreferrer">{t("JMS payment guide ↗", "JMSの決済ガイド ↗")}</a>
                </details>
            </Card>
            <Card $selected={selected === "phone_square"} aria-labelledby="payment-plan-square">
                <Badge>{t("Recommended for phone payments", "スマホで受け付けたいならおすすめ")}</Badge>
                <h4 id="payment-plan-square">{t("Use the shop’s phone · Square", "お店のスマホを使う・Square")}</h4>
                <p>{t("The customer taps a card or phone on the shop’s compatible phone, using Square’s payment app.", "Squareの決済アプリで、お客様のカードやスマホをお店の対応スマホにタッチします。")}</p>
                <Cost>{t("May reduce fees — compare your contract.", "手数料が下がる可能性：今の契約と比較")}</Cost>
                {choose("phone_square")}
                <details><summary>{t("Review requirements", "確認すること")}</summary>
                <ul>
                    <li>{t("A compatible iPhone/Android and Square account are needed.", "対応iPhone・AndroidとSquareのアカウントが必要。")}</li>
                    <li>{t("Email/text receipts; paper needs a supported printer.", "電子レシートに対応。紙には対応プリンターが必要。")}</li>
                </ul>

                    <p>{t("BarTicket-to-Square amount handoff would need a supported integration; it is not built or enabled here. A Square payment does not prove the existing JMS terminal can print its receipt.", "BarTicketの金額をSquareへ渡すには、対応する連携が必要です。ここでは未実装・未接続です。Squareの支払いで今のJMS端末がレシートを印刷できるとは限りません。")}</p>
                    <p>{t("Square’s POS app handoff has no complete sandbox flow. Any real payment or live test needs separate approval first. That handoff does not send itemized sales, so keep the itemized BarTicket bill separate.", "Squareの決済アプリ連携には、一連の流れを試せる完全なテスト環境がありません。実際の支払いや本番テストは、別途承認してから行います。この引き継ぎでは商品別の明細を送らないため、BarTicketの明細は別に残します。")}</p>
                    <p>{t("Published reference, checked 1 Nov 2026: eligible businesses with annual cashless sales below ¥30 million can receive 2.5% for major-card in-person payments. Otherwise 3.25%+ or a custom rate applies. Confirm eligibility and the exact payment method; this is not Nori’s quote.", "公開料金（2026年11月1日確認）：年間キャッシュレス決済額3,000万円未満などの条件を満たす場合、主要カードの対面決済は2.5%。それ以外は3.25%〜または個別料金です。適用条件と支払方法の確認が必要で、Noriの契約料金ではありません。")}</p>
                    <p>{t("Example only: IF the current JMS rate were 3.24% and Square’s eligible 2.5% applied, the difference would be 0.74 percentage points — ¥740 less per ¥100,000 processed, before other costs. Neither rate is confirmed for this bar. Phone/printer, monthly and development costs can change the result.", "比較例のみ：仮に今のJMSが3.24%で、Squareの2.5%が適用されるなら、差は0.74ポイント。決済額10万円あたり740円少なくなります（その他の費用は別）。どちらもお店への適用は未確認です。スマホ・プリンター代、月額費用、開発費で結果は変わります。")}</p>
                    <p>{t("Square offers Tap to Pay on compatible iPhones and Android phones in Japan. Check the exact model, payment limits and supported cards; not every Japanese electronic-money service is included. Its POS app handoff is listed for Japan, unlike the separate Mobile Payments SDK.", "日本では対応するiPhone・Androidで利用できます。機種・決済上限・対応カードを確認してください。日本の電子マネーすべてに対応するわけではありません。日本向けにはSquareの決済アプリへ引き継ぐ方法が案内されています。独自アプリ内へ組み込む別の仕組みとは異なります。")}</p>
                    <SourceLinks><a href="https://squareup.com/jp/ja/payments/tap-to-pay" target="_blank" rel="noopener noreferrer">{t("Phone payments and official rates ↗", "スマホ決済と公式料金 ↗")}</a><a href="https://squareup.com/jp/ja/payments/tap-to-pay-android" target="_blank" rel="noopener noreferrer">{t("Android requirements ↗", "Androidの条件 ↗")}</a><a href="https://squareup.com/help/jp/ja/article/6139-print-receipts" target="_blank" rel="noopener noreferrer">{t("Receipts and supported printers ↗", "レシートと対応プリンター ↗")}</a><a href="https://developer.squareup.com/docs/pos-api/what-it-does" target="_blank" rel="noopener noreferrer">{t("App handoff requirements ↗", "決済アプリへの引き継ぎ条件 ↗")}</a><a href="https://developer.squareup.com/docs/devtools/sandbox/overview" target="_blank" rel="noopener noreferrer">{t("Testing limits ↗", "テスト環境の制限 ↗")}</a></SourceLinks>
                </details>
            </Card>
            <Card $selected={selected === "linked_jms"} aria-labelledby="payment-plan-linked">
                <Badge>{t("Check the terminal first", "まず端末の確認が必要")}</Badge>
                <h4 id="payment-plan-linked">{t("Link the bill to the JMS terminal", "会計金額をJMS端末へ送る")}</h4>
                <p>{t("Explore sending the ticket amount to the terminal instead of typing it twice.", "金額を2回入力せず、BarTicketから端末へ送る方法を確認します。")}</p>
                <Cost>{t("Cost: contract and any integration charges are unknown.", "費用：契約料率・連携費用の確認が必要")}</Cost>
                {choose("linked_jms")}
                <details><summary>{t("Review requirements", "確認すること")}</summary>
                <ul>
                    <li>{t("The customer would tap the payment terminal, not the shop’s phone.", "タッチする先は決済端末。お店のスマホではありません。")}</li>
                    <li>{t("Compatibility with BarTicket is not yet verified.", "BarTicketとの連携が可能かは、まだ未確認。")}</li>
                </ul>

                    <p>{t("First note the exact model in the terminal guide below. Then ask JMS whether that model and contract support a custom POS connection, payment results, and customer/shop receipt printing. A model selection is not approval to connect.", "下の端末ガイドで正しい機種を記録してください。その機種・契約で独自の会計アプリとの連携、決済結果の受信、お客様控え・店舗控えの印刷に対応するか、JMSに確認します。機種の選択は接続の承認ではありません。")}</p>
                    <a href="https://www.japanmerchantservices.com/lp/004/terminal/" target="_blank" rel="noopener noreferrer">{t("JMS terminal options ↗", "JMSの端末一覧 ↗")}</a>
                </details>
            </Card>
        </Cards>
        <Notice><strong>{t("Which is cheapest? Not known yet.", "いちばん安い方法は、まだ判断できません。")}</strong>{" "}{t("Compare Nori’s actual JMS rate, each provider’s eligibility, and any phone/printer or monthly costs first. A published rate is not the bar’s quote.", "今のJMS料率、各社の適用条件、スマホ・プリンター代や月額費用を比べてから決めましょう。公開料金がお店の契約料金とは限りません。")}</Notice>
        <details><summary>{t("More options · Stripe (more setup work)", "ほかの方法・Stripe（開発が必要）")}{selected === "advanced_stripe" ? t(" — selected", " — 選択中") : ""}</summary>
            <Card $selected={selected === "advanced_stripe"} aria-labelledby="payment-plan-stripe">
                <Badge>{t("Advanced · more development", "上級者向け・開発の手間が多い")}</Badge>
                <h4 id="payment-plan-stripe">{t("Build phone payments with Stripe Terminal", "Stripe Terminalでスマホ決済を作る")}</h4>
                <p>{t("A supported native payment app must be developed. This is not enabled by opening BarTicket in a browser.", "対応するスマホ用アプリの開発が必要です。ブラウザーでBarTicketを開くだけでは使えません。")}</p>
                <Cost>{t("Cost: processing, per-authorization fees, and development.", "費用：決済料率・認証ごとの料金・開発費")}</Cost>
                {choose("advanced_stripe")}
                <details><summary>{t("Review requirements", "確認すること")}</summary>
                    <p>{t("Stripe Terminal phone payments are different from Stripe online checkout. Check device/country eligibility, native SDK integration and receipt delivery/printing. Reusing a JMS printer is not verified.", "Stripe Terminalのスマホ決済は、Stripeのオンライン決済とは別です。端末・国の対応、スマホ用アプリへの組込み、レシートの送付・印刷方法を確認する必要があります。JMS端末のプリンターを使えるかは未確認です。")}</p>
                    <p>{t("Published reference, checked 1 Nov 2026: 3.24% per successful payment, plus ¥18 for EACH Tap to Pay authorization. It is not a percentage-only fee. Stripe describes Japan Terminal availability as public preview; verify the account, supported phone and native app requirements before choosing it.", "公開料金（2026年11月1日確認）：決済成功ごとに3.24%に加え、Tap to Payの認証1回ごとに18円。料率だけでは比較できません。日本のTerminalは公開プレビューとして案内されています。アカウント・対応スマホ・専用アプリの条件を確認してから検討してください。")}</p>
                    <SourceLinks><a href="https://stripe.com/jp/terminal" target="_blank" rel="noopener noreferrer">{t("Stripe Terminal in Japan ↗", "Stripe Terminalの案内 ↗")}</a><a href="https://support.stripe.com/questions/terminal-in-japan?locale=ja-JP" target="_blank" rel="noopener noreferrer">{t("Japan availability and requirements ↗", "日本での対応状況・条件 ↗")}</a><a href="https://stripe.com/jp/pricing" target="_blank" rel="noopener noreferrer">{t("Official rates ↗", "公式料金 ↗")}</a></SourceLinks>
                </details>
            </Card>
        </details>
        {!onSelect && <small>{t("Comparison only. Only the payment account owner can save a preference; private saved settings are not shown here.", "比較ガイドのみ表示しています。希望を保存できるのは決済アカウントの所有者だけです。非公開の保存内容は表示していません。")}</small>}
    </Guide>;
}

const Guide = styled.section`
    display:grid; gap:var(--space-2); min-width:0;
    h3, h4, p { margin:0; }
    header { display:grid; gap:var(--space-1); }
    h3 { font-size:var(--font-size-h4); }
    h4 { font-size:1.1em; line-height:1.4; }
    details { min-width:0; }
    summary { cursor:pointer; font-weight:600; padding:var(--space-1) 0; }
    details p { margin:var(--space-1) 0; }
    small { line-height:1.6; }
`;
const Cards = styled.div`
    display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:var(--space-2);
    @media(max-width:800px) { grid-template-columns:minmax(0,1fr); }
`;
const Card = styled.article<{ $selected: boolean }>`
    display:flex; flex-direction:column; align-items:stretch; gap:var(--space-1);
    min-width:0; padding:var(--space-2); border-radius:var(--space-1);
    border:2px solid ${({ $selected }) => $selected ? "var(--primary-300, #a8bcff)" : "var(--neutral-600)"};
    background:var(--neutral-800); color:var(--font-color);
    ul { margin:0; padding-left:1.2em; }
    li { margin-bottom:var(--space-0); }
    button { margin-top:auto; }
    html.light & { background:var(--neutral-050); border-color:${({ $selected }) => $selected ? "#1d4ed8" : "#737373"}; }
`;
const Badge = styled.strong`
    display:block; font-size:0.85em; line-height:1.5; color:#b9ddff;
    html.light & { color:#184879; }
`;
const Cost = styled.p`font-weight:600; font-size:0.9em;`;
const Notice = styled.p`font-size:0.95em; line-height:1.6;`;
const Choose = styled.button`
    width:100%; min-width:0; white-space:normal; padding:var(--space-1);
    font-size:0.95em; line-height:1.5;
`;
const SourceLinks = styled.div`display:flex; flex-direction:column; gap:var(--space-1);`;
