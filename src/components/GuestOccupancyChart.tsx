import { useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import type { ShiftReport } from "../api/account";
import { CopyPanelButton } from "../components/AnalyticsCharts";
import { localeTag, useI18n } from "../i18n";
import type { Ticket } from "../types/Ticket";
import { guestOccupancyTimeline, type GuestOccupancyPoint } from "../pages/guestOccupancy";

type Props = {
    shift: ShiftReport;
    tickets: Ticket[];
    now: number;
    dateLabel: string;
};

function timeLabel(timestamp: number, locale: "en" | "ja") {
    return new Date(timestamp * 1000).toLocaleTimeString(localeTag(locale), {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function valueLabel(value: number, locale: "en" | "ja") {
    return Math.round(value).toLocaleString(localeTag(locale));
}

function makeLinePath(
    points: GuestOccupancyPoint[],
    x: (at: number) => number,
    y: (value: number) => number,
    value: (point: GuestOccupancyPoint) => number,
) {
    if (points.length === 0) return "";
    let path = "M " + x(points[0].at) + " " + y(value(points[0]));
    for (const point of points.slice(1)) {
        path += " H " + x(point.at) + " V " + y(value(point));
    }
    return path;
}

function makeFirstTimeArea(
    points: GuestOccupancyPoint[],
    x: (at: number) => number,
    y: (value: number) => number,
    baseline: number,
) {
    if (points.length === 0) return "";
    let path = "M " + x(points[0].at) + " " + baseline + " V " + y(points[0].firstTime);
    for (const point of points.slice(1)) {
        path += " H " + x(point.at) + " V " + y(point.firstTime);
    }
    const last = points[points.length - 1];
    return path + " H " + x(last.at) + " V " + baseline + " Z";
}

function makeReturningArea(
    points: GuestOccupancyPoint[],
    x: (at: number) => number,
    y: (value: number) => number,
) {
    if (points.length === 0) return "";
    let path = "M " + x(points[0].at) + " " + y(points[0].total);
    for (const point of points.slice(1)) {
        path += " H " + x(point.at) + " V " + y(point.total);
    }
    for (let index = points.length - 1; index >= 0; index -= 1) {
        path += " V " + y(points[index].firstTime) + " H " + x(points[index].at);
    }
    return path + " Z";
}

export default function GuestOccupancyChart({ shift, tickets, now, dateLabel }: Props) {
    const { locale } = useI18n();
    const chartRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    const timeline = useMemo(
        () => guestOccupancyTimeline(shift, tickets, now),
        [shift, tickets, now],
    );

    useEffect(() => {
        const element = chartRef.current;
        if (!element) return;
        const observer = new ResizeObserver((entries) => {
            const nextWidth = entries[0]?.contentRect.width;
            if (nextWidth) setWidth(Math.round(nextWidth));
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const live = shift.status === "open";
    const title = locale === "ja" ? "店内人数の推移" : "Guests in Bar";
    const peakLabel = locale === "ja" ? "このシフトの最大人数" : "peak guests";
    const currentLabel = locale === "ja" ? "現在店内" : "in bar now";
    const firstTimeLabel = locale === "ja" ? "初来店" : "First-time";
    const returningLabel = locale === "ja" ? "リピーター" : "Returning";
    const totalLabel = locale === "ja" ? "合計人数" : "Total guests";
    const noHistory = locale === "ja"
        ? "このシフトのチケット別履歴がないため、人数の推移を表示できません。"
        : "Ticket-level history isn't available for this shift, so its guest timeline can't be shown.";
    const estimateNote = locale === "ja"
        ? "チケットの開始・終了時刻から算出した推定値です。"
        : "Estimated from ticket open and close times.";
    const copyText = timeline
        ? [
            dateLabel + " → " + title,
            (live ? currentLabel : peakLabel) + ": " + (live ? timeline.current : timeline.peak),
            peakLabel + ": " + timeline.peak,
            firstTimeLabel + ": " + timeline.firstTime,
            returningLabel + ": " + timeline.returning,
        ].join("\n")
        : dateLabel + " → " + title + ": " + noHistory;

    const plotWidth = width || 320;
    const plotHeight = 220;
    const left = 34;
    const right = 10;
    const top = 14;
    const bottom = 30;
    const baseline = plotHeight - bottom;
    const chartTop = top;
    const chartSpan = Math.max(1, baseline - chartTop);
    const maxY = timeline ? Math.max(5, Math.ceil(timeline.peak / 5) * 5) : 5;
    const yStep = maxY <= 25 ? 5 : Math.ceil(maxY / 4 / 5) * 5;
    const yTicks: number[] = [];
    for (let tick = 0; tick <= maxY; tick += yStep) yTicks.push(tick);
    if (yTicks[yTicks.length - 1] !== maxY) yTicks.push(maxY);

    const start = timeline?.start ?? shift.opened_at;
    const end = timeline?.end ?? shift.closed_at ?? now;
    const duration = Math.max(1, end - start);
    const x = (at: number) => left + ((at - start) / duration) * (plotWidth - left - right);
    const y = (value: number) => baseline - (value / maxY) * chartSpan;
    const xTickCount = plotWidth < 430 ? 2 : 4;
    const xTicks = Array.from({ length: xTickCount + 1 }, (_, index) => start + (duration * index) / xTickCount);
    const points = timeline?.points ?? [];
    const peakPoint = points.find((point) => point.total === timeline?.peak) ?? null;
    const firstArea = makeFirstTimeArea(points, x, y, baseline);
    const returningArea = makeReturningArea(points, x, y);
    const totalPath = makeLinePath(points, x, y, (point) => point.total);

    return (
        <ChartCard aria-label={title} data-testid="guest-occupancy-chart">
            <ChartHeader>
                <div>
                    <h2>{title}</h2>
                    <ShiftLabel>{dateLabel} · {timeLabel(start, locale)}–{timeLabel(end, locale)}</ShiftLabel>
                </div>
                <HeaderActions>
                    {timeline ? (
                        <Headline aria-live="polite">
                            <strong>{valueLabel(live ? timeline.current : timeline.peak, locale)}</strong>
                            <span>{live ? currentLabel : peakLabel}</span>
                            {live ? (
                                <small>{locale === "ja" ? "最大 " : "Peak "}{valueLabel(timeline.peak, locale)}</small>
                            ) : null}
                        </Headline>
                    ) : null}
                    <CopyPanelButton text={copyText} locale={locale} />
                </HeaderActions>
            </ChartHeader>
            {timeline ? (
                <>
                    <ChartViewport ref={chartRef}>
                        <svg
                            viewBox={"0 0 " + plotWidth + " " + plotHeight}
                            role="img"
                            aria-label={
                                locale === "ja"
                                    ? "チケットの開始と終了時刻による、初来店客とリピーターの推定人数"
                                    : "Estimated first-time and returning guests in the bar over the selected shift"
                            }
                        >
                            {yTicks.map((tick) => (
                                <g key={tick}>
                                    <Gridline x1={left} x2={plotWidth - right} y1={y(tick)} y2={y(tick)} />
                                    <AxisLabel x={left - 7} y={y(tick) + 4} textAnchor="end">
                                        {valueLabel(tick, locale)}
                                    </AxisLabel>
                                </g>
                            ))}
                            <path d={firstArea} fill="var(--royal-300)" fillOpacity=".55" />
                            <path d={returningArea} fill="var(--warning-500)" fillOpacity=".64" />
                            <path d={totalPath} fill="none" stroke="var(--neutral-050)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                            {peakPoint ? (
                                <circle cx={x(peakPoint.at)} cy={y(peakPoint.total)} r="4" fill="var(--neutral-050)" stroke="var(--neutral-900)" strokeWidth="2" />
                            ) : null}
                            {xTicks.map((tick, index) => {
                                const position = x(tick);
                                const anchor = index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle";
                                return (
                                    <AxisLabel key={index} x={position} y={plotHeight - 8} textAnchor={anchor}>
                                        {timeLabel(tick, locale)}
                                    </AxisLabel>
                                );
                            })}
                        </svg>
                    </ChartViewport>
                    <Legend>
                        <LegendItem><Swatch style={{ backgroundColor: "var(--royal-300)" }} />{firstTimeLabel}</LegendItem>
                        <LegendItem><Swatch style={{ backgroundColor: "var(--warning-500)" }} />{returningLabel}</LegendItem>
                        <LegendItem><LineSwatch />{totalLabel}</LegendItem>
                    </Legend>
                    <Footnote>{estimateNote}</Footnote>
                </>
            ) : (
                <NoHistory>{noHistory}</NoHistory>
            )}
        </ChartCard>
    );
}

const ChartCard = styled.section`
    margin-top: var(--space-2);
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;
    min-width: 0;

    h2 {
        margin: 0;
        font-size: var(--font-size-h5);
        font-weight: 500;
    }
`;

const ChartHeader = styled.header`
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-1);
    min-width: 0;
`;

const ShiftLabel = styled.p`
    margin: var(--space-0) 0 0;
    color: var(--neutral-400);
    font-size: var(--font-size-small);
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
    flex: none;
`;

const Headline = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    text-align: right;
    white-space: nowrap;

    strong {
        font-family: var(--font-family-data);
        font-size: var(--font-size-h3);
        line-height: 1.1;
        font-weight: 500;
    }

    span, small {
        color: var(--neutral-400);
        font-size: var(--font-size-small);
    }
`;

const ChartViewport = styled.div`
    width: 100%;
    min-width: 0;
    margin-top: var(--space-1);

    svg {
        display: block;
        width: 100%;
        height: auto;
        overflow: visible;
    }
`;

const Gridline = styled.line`
    stroke: var(--neutral-700);
    stroke-width: 1;
`;

const AxisLabel = styled.text`
    fill: var(--neutral-300);
    font-family: var(--font-family-data);
    font-size: var(--font-size-small);
`;

const Legend = styled.div`
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-0) var(--space-2);
    margin: var(--space-0) 0 0 var(--space-3);
    color: var(--neutral-300);
    font-size: var(--font-size-small);
`;

const LegendItem = styled.span`
    display: inline-flex;
    align-items: center;
    gap: var(--space-0);
    white-space: nowrap;
`;

const Swatch = styled.span`
    display: inline-block;
    width: 9px;
    height: 9px;
    flex: none;
    border-radius: 2px;
`;

const LineSwatch = styled.span`
    display: inline-block;
    width: 13px;
    height: 2px;
    flex: none;
    border-radius: 2px;
    background: var(--neutral-050);
`;

const Footnote = styled.p`
    margin: var(--space-1) 0 0;
    padding-top: var(--space-1);
    border-top: 1px solid var(--neutral-800);
    color: var(--neutral-400);
    font-size: var(--font-size-small);
`;

const NoHistory = styled.p`
    margin: var(--space-2) 0 0;
    color: var(--neutral-300);
`;
