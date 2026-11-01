export function settlementLabel(status: string, ja: boolean) {
    const labels: Record<string, [string, string]> = {
        outstanding: ["Needs collection", "未回収"],
        partially_paid: ["Partially collected", "一部回収"],
        settled: ["Settled", "回収済み"],
        written_off: ["Written off", "免除済み"],
    };
    return labels[status]?.[ja ? 1 : 0] ?? (ja ? "状態未確認" : "Status unavailable");
}

export function unpaidReasonOptions(ja: boolean) {
    return [
        ["walkout", ja ? "支払い前に退店" : "Left without paying"],
        ["failed_payment", ja ? "決済失敗" : "Payment failed"],
        ["terminal_outage", ja ? "端末・通信障害" : "Terminal or network outage"],
        ["pay_later", ja ? "後払いの合意" : "Agreed to pay later"],
        ["disputed_bill", ja ? "会計内容に異議" : "Payment dispute"],
        ["staff_oversight", ja ? "スタッフの対応漏れ" : "Staff oversight"],
        ["other", ja ? "その他" : "Other"],
    ];
}

export function unpaidReasonLabel(reason: string | null | undefined, ja: boolean) {
    return unpaidReasonOptions(ja).find(([value]) => value === reason)?.[1] ?? (reason ? (ja ? "未分類の理由" : "Unrecognized reason") : "—");
}
