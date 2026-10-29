import styled from "styled-components";
import { localeTag, type Locale } from "../i18n";

export type PayChartSegment = {
    key: string;
    label: string;
    value: number;
    color: string;
};

export type PayChartRow = {
    key: string;
    label: string;
    segments: PayChartSegment[];
    total: number;
};

/** A compact, accessible horizontal stacked bar chart for existing pay summaries. */
export default function PayBreakdownChart({
    title, rows, locale, note,
}: {
    title: string;
    rows: PayChartRow[];
    locale: Locale;
    note?: string;
}) {
    const segmentLabels = [...new Map(rows.flatMap(row => row.segments)
        .map(segment => [segment.key, segment])).values()];
    const max = Math.max(0, ...rows.map(row => row.total));
    const money = (value: number) => new Intl.NumberFormat(localeTag(locale), {
        style: "currency", currency: "JPY", maximumFractionDigits: 2,
    }).format(value);

    if (!rows.length || max <= 0) return null;

    return (
        <Figure aria-label={title}>
            <figcaption>{title}</figcaption>
            {note ? <Note>{note}</Note> : null}
            <Legend>
                {segmentLabels.map(segment => <span key={segment.key}>
                    <Swatch $color={segment.color} aria-hidden="true" />{segment.label}
                </span>)}
            </Legend>
            <Rows>
                {rows.map(row => (
                    <ChartRow key={row.key}>
                        <RowHeading>
                            <span>{row.label}</span>
                            <strong>{money(row.total)}</strong>
                        </RowHeading>
                        <Track role="meter" aria-label={row.label} aria-valuemin={0}
                            aria-valuemax={max} aria-valuenow={Math.min(max, Math.max(0, row.total))}
                            aria-valuetext={money(row.total)}>
                            {row.segments.map(segment => {
                                const width = Math.max(0, segment.value) / max * 100;
                                return <Segment key={segment.key} $color={segment.color}
                                    style={{ width: `${width}%` }} />;
                            })}
                        </Track>
                    </ChartRow>
                ))}
            </Rows>
        </Figure>
    );
}

const Figure = styled.figure`
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-2);
    border: 1px solid var(--neutral-700);
    border-radius: 10px;
    min-width: 0;
    figcaption { font-weight: 600; }
`;
const Note = styled.p`color: var(--neutral-300); font-size: var(--font-size-small);`;
const Legend = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1) var(--space-2);
    color: var(--neutral-300);
    font-size: var(--font-size-small);
    span { display: inline-flex; align-items: center; gap: var(--space-0); }
`;
const Swatch = styled.span<{ $color: string }>`
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: ${({ $color }) => $color};
`;
const Rows = styled.div`display: flex; flex-direction: column; gap: var(--space-1);`;
const ChartRow = styled.div`display: flex; flex-direction: column; gap: 4px; min-width: 0;`;
const RowHeading = styled.div`
    display: flex;
    justify-content: space-between;
    gap: var(--space-1);
    min-width: 0;
    span { overflow-wrap: anywhere; }
    strong { white-space: nowrap; font-family: var(--font-family-data); }
`;
const Track = styled.div`
    display: flex;
    overflow: hidden;
    width: 100%;
    height: 12px;
    border-radius: 999px;
    background: var(--neutral-800);
`;
const Segment = styled.span<{ $color: string }>`
    display: block;
    height: 100%;
    background: ${({ $color }) => $color};
`;
