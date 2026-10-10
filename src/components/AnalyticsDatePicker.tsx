import { useEffect, useRef, useState } from "react";
import styled from "styled-components";

import Icon from "./Icon";
import { localeTag, useI18n, type Locale } from "../i18n";

type AnalyticsDatePickerProps = {
    label: string;
    value: string;
    shiftDates: string[];
    onChange: (iso: string) => void;
};

export default function AnalyticsDatePicker({
    label,
    value,
    shiftDates,
    onChange,
}: AnalyticsDatePickerProps) {
    const { t, locale } = useI18n();
    const [open, setOpen] = useState(false);
    const [visibleMonth, setVisibleMonth] = useState(() => monthKey(value || todayIso()));
    const rootRef = useRef<HTMLDivElement>(null);
    const nights = new Set(shiftDates);

    useEffect(() => {
        if (!open) return;
        setVisibleMonth(monthKey(value || todayIso()));
        function handleClickOutside(event: MouseEvent) {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        }
        function handleKey(event: KeyboardEvent) {
            if (event.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open, value]);

    const weekdays = weekdayLabels(locale);
    const cells = monthCells(visibleMonth);
    const monthLabel = formatMonth(visibleMonth, locale);

    return (
        <Root ref={rootRef}>
            <DateButton
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
            >
                <Icon name="CalendarBlank" size="var(--font-size-h4)" />
                {label}
            </DateButton>
            {open ? (
                <Popover>
                    <MonthBar>
                        <Step
                            type="button"
                            aria-label={t("prev")}
                            onClick={() => setVisibleMonth((current) => shiftMonth(current, -1))}
                        >
                            <Icon name="CaretLeft" size="1.2rem" />
                        </Step>
                        <MonthName>{monthLabel}</MonthName>
                        <Step
                            type="button"
                            aria-label={t("next")}
                            onClick={() => setVisibleMonth((current) => shiftMonth(current, 1))}
                        >
                            <Icon name="CaretRight" size="1.2rem" />
                        </Step>
                    </MonthBar>
                    <Grid>
                        {weekdays.map((name) => (
                            <Weekday key={name}>{name}</Weekday>
                        ))}
                        {cells.map((cell) => {
                            const selected = cell.iso === value;
                            const hasNight = nights.has(cell.iso);
                            return (
                                <Day
                                    key={cell.iso}
                                    type="button"
                                    $selected={selected}
                                    $muted={!cell.inMonth}
                                    $hasNight={hasNight}
                                    onClick={() => {
                                        onChange(cell.iso);
                                        setOpen(false);
                                    }}
                                >
                                    {cell.day}
                                </Day>
                            );
                        })}
                    </Grid>
                </Popover>
            ) : null}
        </Root>
    );
}

function todayIso() {
    const now = new Date();
    return toIso(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function monthKey(iso: string) {
    return iso.slice(0, 7);
}

function toIso(year: number, month: number, day: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(key: string, delta: number) {
    const [year, month] = key.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(key: string, locale: Locale) {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(localeTag(locale), {
        month: "long",
        year: "numeric",
    });
}

function weekdayLabels(locale: Locale) {
    return Array.from({ length: 7 }, (_, index) =>
        new Date(2024, 0, 1 + index).toLocaleDateString(localeTag(locale), { weekday: "short" }),
    );
}

function monthCells(key: string) {
    const [year, month] = key.split("-").map(Number);
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();
    const cells: { iso: string; day: number; inMonth: boolean }[] = [];
    for (let index = 0; index < firstWeekday; index += 1) {
        const date = new Date(year, month - 1, index - firstWeekday + 1);
        cells.push({
            iso: toIso(date.getFullYear(), date.getMonth() + 1, date.getDate()),
            day: date.getDate(),
            inMonth: false,
        });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
        cells.push({ iso: toIso(year, month, day), day, inMonth: true });
    }
    const trailing = (7 - (cells.length % 7)) % 7;
    for (let index = 1; index <= trailing; index += 1) {
        const date = new Date(year, month, index);
        cells.push({
            iso: toIso(date.getFullYear(), date.getMonth() + 1, date.getDate()),
            day: date.getDate(),
            inMonth: false,
        });
    }
    return cells;
}

const Root = styled.div`
    position: relative;
    width: fit-content;
    max-width: 100%;
`;

const DateButton = styled.button`
    width: auto;
    max-width: 100%;
    background: var(--neutral-900);
    border: 1px solid var(--neutral-700);
    white-space: normal;

    svg {
        width: var(--font-size-h4);
        height: var(--font-size-h4);
        flex-shrink: 0;
    }

    &:hover {
        background: var(--neutral-800);
        transform: none;
    }
`;

const Popover = styled.div`
    position: absolute;
    top: calc(100% + var(--space-1));
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    width: max-content;
    max-width: calc(100vw - var(--space-3));
    padding: var(--space-1);
    background: var(--neutral-900);
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-2);
`;

const MonthBar = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    margin-bottom: var(--space-1);
`;

const MonthName = styled.strong`
    font-weight: 500;
`;

const Step = styled.button`
    width: var(--space-3);
    height: var(--space-3);
    padding: 0;
    background: transparent;
    border: 1px solid var(--neutral-700);
    border-radius: var(--space-1);

    &:hover {
        background: var(--neutral-800);
        transform: none;
    }
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(7, var(--space-3));
    gap: 2px;
`;

const Weekday = styled.span`
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--space-2);
    color: var(--neutral-400);
    font-size: var(--font-size-small);
`;

const Day = styled.button<{ $selected: boolean; $muted: boolean; $hasNight: boolean }>`
    width: var(--space-3);
    height: var(--space-3);
    padding: 0;
    border-radius: var(--space-1);
    background: ${({ $selected }) => ($selected ? "var(--royal-500)" : "transparent")};
    color: ${({ $muted, $selected }) => {
        if ($selected) return "white";
        return $muted ? "var(--neutral-500)" : "white";
    }};
    box-shadow: ${({ $hasNight, $selected }) =>
        $hasNight && !$selected ? "inset 0 -2px 0 var(--royal-300)" : "none"};

    &:hover {
        background: ${({ $selected }) => ($selected ? "var(--royal-400)" : "var(--neutral-800)")};
        transform: none;
    }
`;
