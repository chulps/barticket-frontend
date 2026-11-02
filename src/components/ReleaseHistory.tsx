import { useEffect, useState } from "react";
import styled from "styled-components";
import { loadReleaseHistory, type AppRelease } from "../api/releaseHistory";
import { useI18n } from "../i18n";

export default function ReleaseHistory() {
    const { locale } = useI18n();
    const ja = locale === "ja";
    const [releases, setReleases] = useState<AppRelease[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const [visible, setVisible] = useState(5);
    useEffect(() => {
        let cancelled = false;
        let active: AbortController | undefined;
        async function refresh() {
            if (document.visibilityState === "hidden" || active) return;
            const controller = new AbortController();
            active = controller;
            try {
                const data = await loadReleaseHistory(controller.signal);
                if (!cancelled) { setReleases(data.releases); setFailed(false); }
            } catch {
                if (!cancelled && !controller.signal.aborted) setFailed(true);
            } finally { if (active === controller) active = undefined; }
        }
        void refresh();
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        const timer = window.setInterval(refresh, 60000);
        return () => {
            cancelled = true;
            active?.abort();
            window.clearInterval(timer);
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, [retry]);
    return <Section aria-labelledby="release-history-heading">
        <h3 id="release-history-heading">{ja ? "アプリの更新履歴" : "App updates"}</h3>
        <Intro>{ja ? "公開されたアプリの更新記録です。シフト終了後も残ります。" : "A record of published app updates, kept after each shift ends."}</Intro>
        {releases === null && !failed ? <p role="status">{ja ? "更新履歴を読み込み中…" : "Loading app updates…"}</p> : null}
        {failed ? <p role="status">{ja ? "更新履歴を確認できませんでした。" : "Could not refresh app updates."} {releases ? (ja ? "前回取得した記録を表示しています。" : "Showing the last loaded records.") : ""} <button type="button" className="small hollow secondary" onClick={() => setRetry(value => value + 1)}>{ja ? "再試行" : "Retry"}</button></p> : null}
        {releases?.length === 0 ? <p>{ja ? "更新記録はまだありません。" : "No app updates recorded yet."}</p> : null}
        {releases && releases.length > 0 ? <List role="list">{releases.slice(0, visible).map(release => <li key={release.id}>
            <Title>{ja ? "BarTicket を更新しました" : "BarTicket updated"}</Title>
            <Meta>{ja ? "バージョン" : "Version"} <code>{release.sha.slice(0, 7)}</code><span aria-hidden="true"> · </span>{ja ? "ビルド日時：" : "Built "}<time dateTime={release.builtAt}>{new Date(release.builtAt).toLocaleString(ja ? "ja-JP" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Tokyo" })} JST</time></Meta>
        </li>)}</List> : null}
        {releases && visible < releases.length ? <button type="button" className="small hollow secondary" onClick={() => setVisible(value => value + 10)}>{ja ? "以前の更新を表示" : "Show older updates"}</button> : null}
    </Section>;
}
const Section = styled.section`margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--neutral-700); h3 { font-size: var(--font-size-h4); line-height: 1.4; margin: 0 0 var(--space-1); }`;
const Intro = styled.p`color: var(--neutral-200); margin: 0 0 var(--space-2); font-size: var(--font-size-p);`;
const List = styled.ol`list-style: none; margin: 0; padding: 0; li { padding: var(--space-2) 0; border-bottom: 1px solid var(--neutral-700); } li:last-child { border-bottom: 0; }`;
const Title = styled.p`margin: 0 0 0.35rem; font-weight: 600; overflow-wrap: anywhere;`;
const Meta = styled.p`margin: 0; color: var(--neutral-200); font-size: var(--font-size-p); line-height: 1.5; overflow-wrap: anywhere; code { color: inherit; }`;
