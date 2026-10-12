import { useRef, useState } from "react";
import styled from "styled-components";

/**
 * Sharing uses LINE's official text-share URL. The user chooses the
 * conversation and confirms the send; no bot or server credentials needed.
 */
export default function AnalyticsReportActions({
    textEn,
    textJa,
    locale,
}: {
    textEn: string;
    textJa: string;
    locale: "en" | "ja";
}) {
    const [expanded, setExpanded] = useState(false);
    const [reportLocale, setReportLocale] = useState<"en" | "ja">(locale);
    const text = reportLocale === "ja" ? textJa : textEn;
    const [copyStatus, setCopyStatus] = useState("");
    const textarea = useRef<HTMLTextAreaElement>(null);
    const ja = locale === "ja";
    const tr = (en: string, jp: string) => ja ? jp : en;
    const lineUrl = "https://line.me/R/share?text=" + encodeURIComponent(text);

    async function copyText() {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                if (!textarea.current) throw new Error("No text to copy");
                textarea.current.focus();
                textarea.current.select();
                if (!document.execCommand("copy")) throw new Error("Copy unavailable");
            }
            setCopyStatus(tr("Copied!", "コピーしました！"));
        } catch {
            textarea.current?.focus();
            textarea.current?.select();
            setCopyStatus(tr("Select and copy the text above.", "上の文章を選択してコピーしてください。"));
        }
    }

    return (
        <ReportArea>
            <button
                type="button"
                className="hollow secondary"
                onClick={() => { setExpanded(!expanded); setCopyStatus(""); }}
                aria-expanded={expanded}
                aria-controls="analytics-text-report"
                disabled={!text}
            >
                {tr("Generate text report", "テキストレポートを作成")}
            </button>
            {expanded && text ? (
                <ReportCard id="analytics-text-report">
                    <header>
                        <h2>{tr("Text report", "テキストレポート")}</h2>
                        <p>{tr(
                            "Preview the report before sharing. LINE lets you choose the team chat and confirm sending.",
                            "送信前に内容を確認してください。LINEでグループを選択し、送信を確定できます。",
                        )}</p>
                    </header>
                    <LanguagePicker>
                        <span>{tr("Report language", "レポートの言語")}</span>
                        <select aria-label={tr("Report language", "レポートの言語")} value={reportLocale} onChange={(event) => { setReportLocale(event.target.value as "en" | "ja"); setCopyStatus(""); }}>
                            <option value="en">English</option>
                            <option value="ja">日本語</option>
                        </select>
                    </LanguagePicker>
                    <ReportText ref={textarea} readOnly value={text} aria-label={tr("Generated report", "作成したレポート")} />
                    <Actions>
                        <button type="button" className="hollow secondary" onClick={() => void copyText()}>
                            {tr("Copy text", "テキストをコピー")}
                        </button>
                        <a href={lineUrl} target="_blank" rel="noopener noreferrer">
                            {tr("Share to LINE ↗", "LINEで共有 ↗")}
                        </a>
                    </Actions>
                    <CopyStatus role="status" aria-live="polite">{copyStatus}</CopyStatus>
                </ReportCard>
            ) : null}
        </ReportArea>
    );
}

const ReportArea = styled.section`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    > button {
        font-size: var(--font-size-default);
    }
`;

const ReportCard = styled.div`
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    border-radius: 12px;
    background: var(--neutral-900);
    border: 1px solid var(--neutral-700);
    h2 { font-size: var(--font-size-h5); font-weight: 600; }
    p { margin-top: var(--space-0); color: var(--neutral-300); font-size: var(--font-size-small); }
`;

const LanguagePicker = styled.label`
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
    font-size: var(--font-size-small);
    color: var(--neutral-300);
    select { background: var(--neutral-800); color: var(--neutral-100); padding: 0.5em; border-radius: 6px; }
`;

const ReportText = styled.textarea`
    width: 100%;
    min-height: 260px;
    max-height: 60vh;
    resize: vertical;
    padding: var(--space-1);
    border: 1px solid var(--neutral-600);
    border-radius: 8px;
    background: var(--neutral-950);
    color: var(--neutral-100);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: var(--font-size-small);
    line-height: 1.6;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
`;

const Actions = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    align-items: center;
    a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        padding: 0.65em 1em;
        border-radius: 8px;
        background: var(--royal-600);
        color: white;
        font-weight: 600;
    }
    a:hover { background: var(--royal-500); }
    a:focus-visible { outline: 2px solid var(--royal-200); outline-offset: 2px; }
`;

const CopyStatus = styled.span`
    color: var(--neutral-300);
    font-size: var(--font-size-small);
    &:empty { display: none; }
`;
