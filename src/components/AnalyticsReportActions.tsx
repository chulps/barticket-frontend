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
                            <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19.365 9.863a.631.631 0 0 1 0 1.261H17.61v1.125h1.755a.63.63 0 1 1 0 1.259h-2.386a.63.63 0 0 1-.627-.629V8.108c0-.345.282-.63.63-.63h2.386a.63.63 0 0 1-.003 1.26H17.61v1.125zm-3.855 3.016a.63.63 0 0 1-.631.627a.62.62 0 0 1-.51-.25l-2.443-3.317v2.94a.63.63 0 0 1-1.257 0V8.108a.627.627 0 0 1 .624-.628c.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63c.345 0 .63.285.63.63zm-5.741 0a.63.63 0 0 1-.631.629a.63.63 0 0 1-.627-.629V8.108c0-.345.282-.63.63-.63c.346 0 .628.285.628.63zm-2.466.629H4.917a.634.634 0 0 1-.63-.629V8.108c0-.345.285-.63.63-.63c.348 0 .63.285.63.63v4.141h1.756a.63.63 0 0 1 0 1.259M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608c.391.082.923.258 1.058.59c.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645c1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                            </svg>
                            <span>{tr("Share to LINE", "LINEで共有")}</span>
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
        gap: 0.5rem;
        text-decoration: none;
        min-height: 44px;
        padding: 0.65em 1em;
        border-radius: 8px;
        background: rgb(7, 181, 59);
        color: white;
        font-weight: 600;
    }
    a svg { width: 24px; height: 24px; flex: none; }
    a:hover { background: rgb(6, 153, 50); }
    a:active { background: rgb(5, 136, 44); }
    a:focus-visible { outline: 2px solid white; outline-offset: 2px; }
`;

const CopyStatus = styled.span`
    color: var(--neutral-300);
    font-size: var(--font-size-small);
    &:empty { display: none; }
`;
