import { terminalModels } from "./terminalModels";

/** Generic manager guide: no account data, private settings, or network requests. */
export default function TerminalIdentificationGuide({ ja }: { ja: boolean }) {
    return <section aria-label={ja ? "端末機種の確認ガイド" : "Terminal identification guide"}>
        <h3>{ja ? "お店で端末の機種を確認" : "Identify the terminal in the shop"}</h3>
        <p>{ja ? "端末本体や付属書類に印刷された機種名を確認してください。見た目だけで判断せず、不明なら「わからない」を選んでください。" : "Check the model name printed on the device or its supplied paperwork. Do not identify it by appearance alone; choose Not sure if you cannot confirm it."}</p>
        <details><summary>{ja ? "機種一覧と公式資料" : "Model list and official references"}</summary>
            <ul>{terminalModels.filter(model => model.url).map(model => <li key={model.id}><a href={model.url} target="_blank" rel="noopener noreferrer">{model.label} ↗</a></li>)}</ul>
        </details>
        <p>{ja ? "MXのWi-Fi・LTEは通信方式・契約の違いです。機種名から通信方式を自動判定しません。LTEの契約でもWi-Fiを使える場合があります。" : "MX Wi-Fi and LTE are connection/contract variants, not separate model guesses. The model does not automatically determine the connection; an LTE contract can also support Wi-Fi."}</p>
        <p>{ja ? "写真を共有する場合は加盟店番号・端末IDなどの識別情報を隠してください。パスワード、APIキー、カード情報は入力しないでください。設定や配線を変更する必要はありません。" : "If sharing a photo, hide merchant numbers, terminal IDs and other identifying details. Do not enter passwords, API keys or card information. There is no need to change settings or wiring."}</p>
        <details><summary>{ja ? "お客様はどの端末にタッチしますか？" : "Which device would the customer tap?"}</summary>
            <p>{ja ? "決済端末にタッチする場合：端末と契約の対応状況を確認してください。BarTicketから金額を送る機能や、決済結果・印刷との連携はまだ確認されていません。" : "The payment terminal: confirm the terminal and merchant contract support. Sending an amount from BarTicket, receiving a payment result, and printer integration are not yet verified."}</p>
            <p>{ja ? "お店のスマホにタッチする場合：別途対応するスマホ決済端末アプリが必要です。このブラウザーアプリを開くだけではスマホは決済端末になりません。スマホの決済から別の端末へ伝えて印刷する仕組みも未確認です。" : "The shop’s phone: this needs a separately supported phone-as-reader payment app. Opening this browser app does not make the phone a payment reader. A phone payment triggering a separate terminal to print is also unverified."}</p>
            <p>{ja ? "お客様控え・店舗控えの印刷可否は、実際の端末と契約・設定で確認してください。ここでは印刷を有効にしません。" : "Check customer-copy and merchant-copy receipt printing on the actual terminal and contract/settings. Nothing here enables printing."}</p>
        </details>
        <p role="status">{ja ? "識別メモのみ・未接続。機種の選択や保存は連携の承認ではなく、決済を有効にしません。お客様への手数料も追加しません。" : "Identification notes only — not connected. Selecting or saving a model does not approve integration or enable payments. No customer fee is added."}</p>
    </section>;
}
