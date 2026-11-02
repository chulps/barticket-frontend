import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { loadDismissedReleaseIds, saveDismissedReleaseIds } from "../api/releaseDismissals";
import { loadReleaseHistory, type AppRelease } from "../api/releaseHistory";
import { getReleaseNote } from "../api/releaseNotes";
import { useI18n } from "../i18n";

type ViewerStatus = "checking" | "ready" | "anonymous" | "unavailable";

export default function ReleaseHistory({ viewerId, viewerStatus }: { viewerId: number | null; viewerStatus: ViewerStatus }) {
    const { locale } = useI18n();
    const ja = locale === "ja";
    const [releases, setReleases] = useState<AppRelease[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [retry, setRetry] = useState(0);
    const [visible, setVisible] = useState(5);
    const [dismissedIds, setDismissedIds] = useState<string[]>([]);
    const [dismissalReady, setDismissalReady] = useState(false);
    const [dismissalScope, setDismissalScope] = useState("");
    const [dismissalRetry, setDismissalRetry] = useState(0);
    const [dismissalError, setDismissalError] = useState(false);
    const [dismissalWarning, setDismissalWarning] = useState(false);
    const [showDismissed, setShowDismissed] = useState(false);

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

    const releaseIdKey = useMemo(() => releases?.map(release => release.id).join("|") ?? "", [releases]);
    useEffect(() => {
        let current = true;
        const scope = viewerId === null ? "" : `${viewerId}:${releaseIdKey}`;
        async function loadDismissals() {
            // Defer local-storage state updates until after render has committed.
            await Promise.resolve();
            if (!current) return;
            if (releaseIdKey === "" || viewerId === null) {
                setDismissedIds([]);
                setDismissalReady(true);
                setDismissalScope(scope);
                setDismissalError(false);
                setDismissalWarning(false);
                return;
            }
            try {
                const loaded = loadDismissedReleaseIds(viewerId, releaseIdKey.split("|"), window.localStorage);
                setDismissedIds(loaded.dismissedIds);
                setDismissalScope(scope);
                setDismissalWarning(loaded.repaired);
                setDismissalError(false);
                setDismissalReady(true);
            } catch {
                setDismissedIds([]);
                setDismissalScope(scope);
                setDismissalError(true);
                setDismissalReady(true);
            }
        }
        void loadDismissals();
        return () => { current = false; };
    }, [dismissalRetry, releaseIdKey, viewerId]);

    // The count is based on the full ledger, not just the currently rendered page.
    const currentDismissalScope = viewerId === null ? "" : `${viewerId}:${releaseIdKey}`;
    const dismissalStateMatches = dismissalReady && dismissalScope === currentDismissalScope;
    const effectiveDismissals = viewerId !== null && dismissalStateMatches ? dismissedIds : [];
    const dismissedSet = new Set(effectiveDismissals);
    const activeReleases = releases?.filter(release => !dismissedSet.has(release.id)) ?? [];
    const dismissedReleases = releases?.filter(release => dismissedSet.has(release.id)) ?? [];
    const shownReleases = (showDismissed ? dismissedReleases : activeReleases).slice(0, visible);
    const canManage = viewerStatus === "ready" && viewerId !== null && dismissalStateMatches && !dismissalError;

    function persistDismissals(nextIds: string[]) {
        if (!canManage || viewerId === null || releases === null) return;
        try {
            saveDismissedReleaseIds(viewerId, nextIds, releases.map(release => release.id), window.localStorage);
            setDismissedIds(nextIds);
            setDismissalError(false);
            setDismissalWarning(false);
            if (showDismissed && nextIds.length === 0) setShowDismissed(false);
        } catch {
            setDismissalError(true);
        }
    }

    function dismiss(releaseId: string) {
        persistDismissals([...dismissedIds, releaseId]);
    }

    function restore(releaseId: string) {
        persistDismissals(dismissedIds.filter(id => id !== releaseId));
    }

    function dismissAll() {
        if (releases) persistDismissals(releases.map(release => release.id));
    }

    function titleFor(release: AppRelease): string {
        const note = release.note ?? getReleaseNote(release.sha);
        return note?.title[ja ? "ja" : "en"] ?? (ja ? "BarTicket を更新しました" : "BarTicket updated");
    }

    return <Section aria-labelledby="release-history-heading">
        <h3 id="release-history-heading">{ja ? "アプリの更新履歴" : "App updates"}</h3>
        <Intro>{ja ? "公開されたアプリの更新記録です。シフト終了後も残ります。" : "A record of published app updates, kept after each shift ends."}</Intro>
        {releases === null && !failed ? <p role="status">{ja ? "更新履歴を読み込み中…" : "Loading app updates…"}</p> : null}
        {failed ? <p role="status">{ja ? "更新履歴を確認できませんでした。" : "Could not refresh app updates."} {releases ? (ja ? "前回取得した記録を表示しています。" : "Showing the last loaded records.") : ""} <button type="button" className="small hollow secondary" onClick={() => setRetry(value => value + 1)}>{ja ? "再試行" : "Retry"}</button></p> : null}
        {releases?.length === 0 ? <p>{ja ? "更新記録はまだありません。" : "No app updates recorded yet."}</p> : null}
        {viewerStatus === "checking" ? <p role="status">{ja ? "アカウントを確認しています…" : "Checking your account…"}</p> : null}
        {viewerStatus === "unavailable" ? <p role="status">{ja ? "アカウントを確認できないため、更新の非表示設定は利用できません。" : "Could not verify your account, so update dismissals are unavailable."}</p> : null}
        {dismissalWarning ? <p role="status">{ja ? "保存済みの非表示設定に問題があったため、安全に無視しました。" : "Some saved dismissal data was invalid and has been ignored."}</p> : null}
        {dismissalError ? <p role="alert">{ja ? "更新の非表示設定を保存できません。ブラウザーの保存領域を確認して再試行してください。" : "Could not save update dismissals. Check browser storage and retry."} <button type="button" className="small hollow secondary" onClick={() => { setDismissalReady(false); setDismissalRetry(value => value + 1); }}>{ja ? "再試行" : "Retry"}</button></p> : null}
        {canManage ? <Controls role="group" aria-label={ja ? "アプリ更新の管理" : "Manage app updates"}>
            <button type="button" className="small hollow secondary" onClick={dismissAll} disabled={activeReleases.length === 0}>{ja ? "すべて非表示" : "Dismiss all"}</button>
            {dismissedReleases.length > 0 || showDismissed ? <button type="button" className="small hollow secondary" onClick={() => { setShowDismissed(value => !value); setVisible(5); }} aria-pressed={showDismissed}>
                {showDismissed ? (ja ? `公開中の更新を見る (${activeReleases.length})` : `View active updates (${activeReleases.length})`) : (ja ? `非表示の更新を見る (${dismissedReleases.length})` : `View dismissed updates (${dismissedReleases.length})`)}
            </button> : null}
        </Controls> : null}
        {showDismissed ? <Subheading>{ja ? "非表示にした更新" : "Dismissed updates"}</Subheading> : null}
        {releases && releases.length > 0 && shownReleases.length === 0 ? <p role="status">{showDismissed ? (ja ? "非表示の更新はありません。" : "No dismissed updates.") : (ja ? "現在の更新はすべて非表示です。非表示の更新一覧から再表示できます。" : "All current updates are dismissed. You can restore them from dismissed updates.")}</p> : null}
        {shownReleases.length > 0 ? <List role="list">{shownReleases.map(release => {
            const note = release.note ?? getReleaseNote(release.sha);
            const language = ja ? "ja" : "en";
            const title = titleFor(release);
            return <li key={release.id}>
                <Title>{title}</Title>
                {note ? <FeatureList>{note.features[language].map(feature => <li key={feature}>{feature}</li>)}</FeatureList> : null}
                <Meta>{ja ? "バージョン" : "Version"} <code>{release.sha.slice(0, 7)}</code><span aria-hidden="true"> · </span>{ja ? "ビルド日時：" : "Built "}<time dateTime={release.builtAt}>{new Date(release.builtAt).toLocaleString(ja ? "ja-JP" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Tokyo" })} JST</time></Meta>
                {canManage ? <ItemAction type="button" className="small hollow secondary"
                    aria-label={showDismissed ? (ja ? `${title} を再表示` : `Restore app update: ${title}`) : (ja ? `${title} を非表示` : `Dismiss app update: ${title}`)}
                    onClick={() => showDismissed ? restore(release.id) : dismiss(release.id)}>
                    {showDismissed ? (ja ? "再表示" : "Restore") : (ja ? "非表示" : "Dismiss")}
                </ItemAction> : null}
            </li>;
        })}</List> : null}
        {releases && shownReleases.length < (showDismissed ? dismissedReleases.length : activeReleases.length) ? <button type="button" className="small hollow secondary" onClick={() => setVisible(value => value + 5)}>{ja ? "更新を5件追加で表示" : "Load 5 more updates"}</button> : null}
    </Section>;
}

const Section = styled.section`margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--neutral-700); h3 { font-size: var(--font-size-h4); line-height: 1.4; margin: 0 0 var(--space-1); }`;
const Intro = styled.p`color: var(--neutral-200); margin: 0 0 var(--space-2); font-size: var(--font-size-p);`;
const Controls = styled.div`display: flex; flex-wrap: wrap; gap: var(--space-1); margin: 0 0 var(--space-1);`;
const Subheading = styled.h4`font-size: var(--font-size-p); margin: var(--space-2) 0 0;`;
const List = styled.ol`list-style: none; margin: 0; padding: 0; li { padding: var(--space-2) 0; border-bottom: 1px solid var(--neutral-700); } li:last-child { border-bottom: 0; }`;
const Title = styled.p`margin: 0 0 0.35rem; font-weight: 600; overflow-wrap: anywhere;`;
const FeatureList = styled.ul`margin: 0 0 var(--space-1); padding-inline-start: 1.25rem; color: var(--neutral-100); font-size: var(--font-size-p); line-height: 1.5; overflow-wrap: anywhere; li { padding: 0; margin: 0 0 0.25rem; border: 0; } li:last-child { margin-bottom: 0; }`;
const Meta = styled.p`margin: 0; color: var(--neutral-200); font-size: var(--font-size-p); line-height: 1.5; overflow-wrap: anywhere; code { color: inherit; }`;
const ItemAction = styled.button`margin-top: var(--space-1);`;
