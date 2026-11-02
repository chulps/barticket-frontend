/** Reviewed, user-facing highlights for production frontend commits.
 * Keep this authored list aligned with actual shipped changes; the public
 * release-history ledger remains the source of release ids and timestamps.
 */
export interface ReleaseNote {
    title: { en: string; ja: string };
    features: { en: string[]; ja: string[] };
}

export const RELEASE_NOTES: Readonly<Record<string, ReleaseNote>> = {
    // Verified against the shipped changes in merged PR #396.
    "d48c8f9894502486d99b64ba9145893520a8adc9": {
        title: { en: "Schedule calendar and ticket updates", ja: "スケジュールカレンダーとチケット更新" },
        features: {
            en: [
                "Plan and edit schedules in a month or agenda calendar.",
                "Ticket lists refresh more efficiently while keeping current information visible.",
                "Live ticket arrivals and status changes now animate again.",
            ],
            ja: [
                "月表示または予定一覧で、スケジュールの作成・編集ができます。",
                "チケット一覧をより効率よく更新し、最新情報を見やすく保ちます。",
                "チケットのライブ更新時に、追加や状態変更のアニメーションが再び表示されます。",
            ],
        },
    },
    // Verified against the shipped changes in merged PR #393.
    "532b62443f541d3fa7e3e07a1ef5194bb22f8926": {
        title: { en: "Sound settings, Team Pay and menus", ja: "サウンド設定・チーム支払い・メニュー" },
        features: {
            en: [
                "Sound settings now include clearer playback states and device guidance.",
                "Team Pay makes deductions and incomplete totals easier to understand.",
                "Dropdown menus have smoother animation and keyboard support.",
            ],
            ja: [
                "サウンド設定で、再生状態やデバイスの案内が分かりやすくなりました。",
                "チーム支払いで、控除額や未確定の合計を確認しやすくなりました。",
                "ドロップダウンメニューの動きとキーボード操作を改善しました。",
            ],
        },
    },
    // Verified against the shipped changes in merged PR #387.
    "49af03e855fbafdf780913ae4fd4b25420725994": {
        title: { en: "Notifications and app update history", ja: "通知とアプリ更新履歴" },
        features: {
            en: [
                "Notification activity now shows ticket names and is easier to follow on mobile.",
                "Published app releases now have a separate history that stays after shifts end.",
            ],
            ja: [
                "通知の履歴にチケット名が表示され、スマートフォンでも確認しやすくなりました。",
                "公開されたアプリ更新を、シフト終了後も別の一覧で確認できます。",
            ],
        },
    },
};

export function getReleaseNote(sha: string): ReleaseNote | undefined {
    return RELEASE_NOTES[sha];
}
