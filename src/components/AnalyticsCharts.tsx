import styled from "styled-components";

export type ChartColumn = {
    id: string;
    label: string;
    value: number;
    title: string;
};

export type ChartMeter = {
    id: string;
    label: string;
    value: number;
    display: string;
    detail?: string;
    color?: string;
};

export function ColumnChart({ title, columns }: { title: string; columns: ChartColumn[] }) {
    const max = Math.max(...columns.map((column) => column.value), 1);

    return (
        <Card aria-label={title}>
            <h2>{title}</h2>
            <Plot>
                {columns.map((column) => (
                    <Column key={column.id} title={column.title}>
                        <Track>
                            <Fill $size={column.value === 0 ? 0 : (column.value / max) * 100} />
                        </Track>
                        <Tick>{column.label}</Tick>
                    </Column>
                ))}
            </Plot>
        </Card>
    );
}

export function MeterChart({ title, meters }: { title: string; meters: ChartMeter[] }) {
    const max = Math.max(...meters.map((meter) => meter.value), 1);

    return (
        <Card aria-label={title}>
            <h2>{title}</h2>
            {meters.map((meter) => (
                <Meter key={meter.id}>
                    <MeterLabel>{meter.label}</MeterLabel>
                    <MeterTrack>
                        <MeterFill
                            $size={meter.value === 0 ? 0 : (meter.value / max) * 100}
                            $color={meter.color}
                        />
                    </MeterTrack>
                    <MeterValue>{meter.display}</MeterValue>
                    {meter.detail ? <Detail>{meter.detail}</Detail> : null}
                </Meter>
            ))}
        </Card>
    );
}

const Card = styled.section`
    padding: var(--space-2);
    background: var(--neutral-900);
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
`;

const Plot = styled.div`
    display: flex;
    align-items: flex-end;
    gap: var(--space-0);
    height: var(--space-5);
    overflow-x: auto;
`;

const Column = styled.div`
    flex: 1 0 2.75rem;
    min-width: 2.75rem;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-0);
`;

const Track = styled.div`
    position: relative;
    flex: 1;
    width: 70%;
    background: var(--neutral-800);
    border-radius: 4px 4px 0 0;
`;

const Fill = styled.div<{ $size: number }>`
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: ${({ $size }) => $size}%;
    background: var(--royal-400);
    border-radius: 4px 4px 0 0;
`;

const Tick = styled.span`
    color: var(--neutral-400);
    font-size: var(--font-size-small);
    line-height: 1;
    text-align: center;
`;

const Meter = styled.div`
    display: grid;
    grid-template-columns: minmax(4.5rem, 7rem) 1fr auto;
    gap: var(--space-0) var(--space-1);
    align-items: center;
`;

const MeterLabel = styled.span`
    color: var(--neutral-200);
`;

const MeterTrack = styled.div`
    height: var(--space-1);
    background: var(--neutral-800);
    border-radius: 999px;
    overflow: hidden;
`;

const MeterFill = styled.div<{ $size: number; $color?: string }>`
    height: 100%;
    width: ${({ $size }) => $size}%;
    background: ${({ $color }) => $color ?? "var(--royal-400)"};
    border-radius: 999px;
`;

const MeterValue = styled.span`
    font-family: var(--font-family-data);
    font-size: var(--font-size-small);
    text-align: right;
`;

const Detail = styled.span`
    grid-column: 1 / -1;
    color: var(--neutral-400);
    font-size: var(--font-size-small);
    margin-top: calc(var(--space-0) * -1);
`;
