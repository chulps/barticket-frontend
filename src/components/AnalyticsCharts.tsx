import { useEffect, useRef, useState } from "react";
import styled from "styled-components";

export type BarSegment = {
    value: number;
    color: string;
};

export type TimeBar = {
    id: string;
    label: string;
    title: string;
    segments: BarSegment[];
};

export type DonutSlice = {
    id: string;
    label: string;
    value: number;
    display: string;
    color: string;
};

export type NamedBar = {
    id: string;
    label: string;
    value: number;
    display: string;
    color?: string;
};

export function BarChart({
    title,
    bars,
    formatTick,
    legend,
    chartHeight = 200,
}: {
    title: string;
    bars: TimeBar[];
    formatTick: (value: number) => string;
    legend?: { label: string; color: string }[];
    chartHeight?: number;
}) {
    const { ref, width: container } = useWidth();
    const max = niceMax(Math.max(...bars.map((bar) => bar.segments.reduce((sum, segment) => sum + segment.value, 0)), 0));
    const ticks = axisTicks(max);
    const available = container > 0 ? container - AXIS - 12 : 480;
    const plotWidth = Math.max(available, bars.length * 40);
    const width = AXIS + plotWidth + 12;
    const height = chartHeight;
    const innerHeight = height - PAD_TOP - PAD_BOTTOM;

    return (
        <Card aria-label={title}>
            <h2>{title}</h2>
            <Scroll ref={ref}>
                <svg viewBox={`0 0 ${width} ${height}`} role="img" width={width} height={height}>
                    {ticks.map((tick) => {
                        const y = PAD_TOP + innerHeight - (tick / max) * innerHeight;
                        return (
                            <g key={tick}>
                                <line x1={AXIS} x2={width - 8} y1={y} y2={y} stroke="var(--neutral-800)" />
                                <text x={AXIS - 8} y={y + 4} textAnchor="end" fill="var(--neutral-400)" fontSize="11">
                                    {formatTick(tick)}
                                </text>
                            </g>
                        );
                    })}
                    <line x1={AXIS} x2={width - 8} y1={PAD_TOP + innerHeight} y2={PAD_TOP + innerHeight} stroke="var(--neutral-600)" />
                    {bars.map((bar, index) => {
                        const slot = plotWidth / Math.max(bars.length, 1);
                        const barWidth = Math.min(64, slot * 0.62);
                        const x = AXIS + index * slot + (slot - barWidth) / 2;
                        const heights = bar.segments.map((segment) => (max === 0 ? 0 : (segment.value / max) * innerHeight));
                        return (
                            <g key={bar.id}>
                                <title>{bar.title}</title>
                                {bar.segments.map((segment, segmentIndex) => {
                                    const barHeight = heights[segmentIndex];
                                    const y = PAD_TOP + innerHeight - heights.slice(0, segmentIndex + 1).reduce((sum, value) => sum + value, 0);
                                    if (barHeight <= 0) return null;
                                    return (
                                        <rect
                                            key={segmentIndex}
                                            x={x}
                                            y={y}
                                            width={barWidth}
                                            height={barHeight}
                                            fill={segment.color}
                                            rx={2}
                                        />
                                    );
                                })}
                                <text
                                    x={x + barWidth / 2}
                                    y={height - 10}
                                    textAnchor="middle"
                                    fill="var(--neutral-400)"
                                    fontSize="11"
                                >
                                    {bars.length > 16 && index % 2 === 1 ? "" : bar.label}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </Scroll>
            {legend ? (
                <InlineLegend>
                    {legend.map((item) => (
                        <LegendItem key={item.label}>
                            <Swatch $color={item.color} />
                            {item.label}
                        </LegendItem>
                    ))}
                </InlineLegend>
            ) : null}
        </Card>
    );
}

export function DonutChart({
    title,
    slices,
    center,
}: {
    title: string;
    slices: DonutSlice[];
    center: string;
}) {
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const drawn = slices.filter((slice) => slice.value > 0);
    const arcs = drawn.map((slice, index) => {
        const start = drawn.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0);
        const length = total === 0 ? 0 : (slice.value / total) * circumference;
        const gap = drawn.length > 1 ? 2 : 0;
        return {
            id: slice.id,
            color: slice.color,
            dash: Math.max(0, length - gap),
            offset: total === 0 ? 0 : (start / total) * circumference,
        };
    });

    return (
        <Card aria-label={title} $compact>
            <h2>{title}</h2>
            <DonutLayout>
                <svg viewBox="0 0 120 120" width="112" height="112" role="img">
                    <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--neutral-800)" strokeWidth="14" />
                    <g transform="rotate(-90 60 60)">
                        {arcs.map((arc) => (
                            <circle
                                key={arc.id}
                                cx="60"
                                cy="60"
                                r={radius}
                                fill="none"
                                stroke={arc.color}
                                strokeWidth="14"
                                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                                strokeDashoffset={-arc.offset}
                            />
                        ))}
                    </g>
                    <text x="60" y="64" textAnchor="middle" fill="white" fontSize="11" fontFamily="var(--font-family-data)">
                        {center}
                    </text>
                </svg>
                <Legend>
                    {slices.map((slice) => (
                        <LegendItem key={slice.id}>
                            <Swatch $color={slice.color} />
                            <span>{slice.label}</span>
                            <Amount>{slice.display}</Amount>
                        </LegendItem>
                    ))}
                </Legend>
            </DonutLayout>
        </Card>
    );
}

export function HorizontalBarChart({ title, bars }: { title: string; bars: NamedBar[] }) {
    const { ref, width: container } = useWidth();
    const max = niceMax(Math.max(...bars.map((bar) => bar.value), 0));
    const width = Math.max(container, 320);
    const row = 28;
    const height = 28 + bars.length * row;
    const labelWidth = 108;
    const plot = width - labelWidth - 88;

    return (
        <Card aria-label={title}>
            <h2>{title}</h2>
            <Scroll ref={ref}>
                <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img">
                    <line x1={labelWidth} x2={labelWidth} y1={8} y2={height - 8} stroke="var(--neutral-600)" />
                    {bars.map((bar, index) => {
                        const y = 20 + index * row;
                        const barWidth = max === 0 ? 0 : (bar.value / max) * plot;
                        return (
                            <g key={bar.id}>
                                <text x={labelWidth - 10} y={y + 5} textAnchor="end" fill="var(--neutral-200)" fontSize="13">
                                    {bar.label}
                                </text>
                                <rect x={labelWidth} y={y - 8} width={Math.max(barWidth, bar.value > 0 ? 2 : 0)} height="16" fill={bar.color ?? "var(--royal-300)"} rx="2" />
                                <text x={labelWidth + barWidth + 8} y={y + 5} fill="var(--neutral-300)" fontSize="12" fontFamily="var(--font-family-data)">
                                    {bar.display}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </Scroll>
        </Card>
    );
}

const AXIS = 64;
const PAD_TOP = 12;
const PAD_BOTTOM = 32;

function useWidth() {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const node = ref.current;
        if (!node) return;
        const observer = new ResizeObserver((entries) => {
            const next = Math.floor(entries[0]?.contentRect.width ?? 0);
            setWidth((current) => (current === next ? current : next));
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return { ref, width };
}

function axisTicks(max: number) {
    if (max <= 0) return [0];
    const rough = max / 4;
    const exponent = Math.pow(10, Math.floor(Math.log10(rough)));
    const fraction = rough / exponent;
    const steps = [1, 2, 2.5, 5, 10];
    const step = (steps.find((item) => item >= fraction - 0.001) ?? 10) * exponent;
    const ticks: number[] = [];
    for (let value = 0; value <= max + step * 0.01; value += step) ticks.push(Math.round(value * 1000) / 1000);
    return ticks;
}

function niceMax(value: number) {
    if (value <= 0) return 1;
    const exponent = Math.pow(10, Math.floor(Math.log10(value)));
    const fraction = value / exponent;
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    const nice = steps.find((step) => step >= fraction - 0.001) ?? 10;
    return nice * exponent;
}

const Card = styled.section<{ $compact?: boolean }>`
    padding: ${({ $compact }) => ($compact ? "var(--space-1)" : "var(--space-2)")};
    background: var(--neutral-900);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    height: 100%;

    h2 {
        font-size: var(--font-size-h5);
        line-height: 1.2;
        font-weight: 500;
    }
`;

const Scroll = styled.div`
    overflow-x: auto;
    min-width: 0;
`;

const DonutLayout = styled.div`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    flex: 1;
`;

const InlineLegend = styled.ul`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
`;

const Legend = styled.ul`
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    width: 100%;
    margin-top: auto;
`;

const LegendItem = styled.li`
    display: flex;
    align-items: center;
    gap: var(--space-0);
    width: 100%;
    color: var(--neutral-200);
`;

const Swatch = styled.span<{ $color: string }>`
    width: var(--space-1);
    height: var(--space-1);
    border-radius: 2px;
    background: ${({ $color }) => $color};
    flex: none;
`;

const Amount = styled.span`
    margin-left: auto;
    font-family: var(--font-family-data);
    color: var(--neutral-300);
    font-size: var(--font-size-small);
`;
