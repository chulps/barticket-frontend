import { useId, useState } from "react";
import styled from "styled-components";
import type { DonutSlice } from "../components/AnalyticsCharts";
import { payDonutGeometry } from "./payDonutGeometry";

export default function PayAllocationDonut({ title, slices, center, locale, note }: {
    title: string; slices: DonutSlice[]; center: string; locale: "en" | "ja"; note: string;
}) {
    const id = useId();
    const [active, setActive] = useState<string | null>(null);
    const arcs = payDonutGeometry(slices.map(slice => slice.value));
    const selected = slices.find(slice => slice.id === active);
    const ja = locale === "ja";
    return <Panel aria-label={title} onKeyDown={event => { if (event.key === "Escape") setActive(null); }}>
        <h3>{title}</h3>
        <Ring viewBox="0 0 120 120" role="group" aria-label={title} onPointerLeave={() => setActive(null)}>
            <defs><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">
                <rect width="120" height="120" fill="white" />
                {arcs.map(arc => <polyline key={arc.index} points="60,60 120,60" stroke="black" strokeWidth={arc.gap}
                    transform={`rotate(${arc.angle - 90} 60 60)`} />)}
            </mask></defs>
            <g mask={`url(#${id})`}><g transform="rotate(-90 60 60)">
                {arcs.map(arc => { const slice = slices[arc.index]; return <path key={slice.id}
                    d={arc.path} fill="none" stroke={slice.color} strokeWidth="14"
                    data-pay-segment={slice.id} role="button" tabIndex={0} aria-label={`${slice.label}: ${slice.display}`}
                    aria-pressed={active === slice.id} onPointerEnter={() => setActive(slice.id)}
                    onFocus={() => setActive(slice.id)} onBlur={() => setActive(null)} onClick={() => setActive(slice.id)}
                    onKeyDown={event => { if (event.key === "Enter" || event.key === " ") {event.preventDefault(); setActive(slice.id);} }}
                    style={{opacity: active && active !== slice.id ? 0.45 : 1}} />; })}
            </g></g>
            <text data-pay-gross-center x="60" y="63" textAnchor="middle" fill="var(--neutral-100)" fontSize="10" fontFamily="var(--font-family-data)">{center}</text>
        </Ring>
        <Readout>
            <span role="status" aria-live="polite">{selected ? `${selected.label}: ${selected.display}` : (ja ? "各区分にカーソルを合わせるか、選択して金額を確認" : "Hover or select a segment to inspect its amount")}</span>
            <span aria-hidden="true">{ja ? "各区分にカーソルを合わせるか、選択して金額を確認" : "Hover or select a segment to inspect its amount"}</span>
            {slices.map(slice => <span key={slice.id} aria-hidden="true">{slice.label}: {slice.display}</span>)}
        </Readout>
        <Legend>{slices.map(slice => <li key={slice.id}><LegendButton type="button" aria-pressed={active === slice.id}
            onPointerEnter={() => setActive(slice.id)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(slice.id)} onBlur={() => setActive(null)} onClick={() => setActive(slice.id)}>
            <Swatch style={{background:slice.color}} aria-hidden="true" /><span>{slice.label}</span><b>{slice.display}</b>
        </LegendButton></li>)}</Legend>
        <p>{note}</p>
    </Panel>;
}
const Panel = styled.section`min-width:0; display:flex; flex-direction:column; gap:var(--space-1); p {color:var(--neutral-300); font-size:var(--font-size-small);}`;
const Ring = styled.svg`display:block; width:min(100%,260px); align-self:center; overflow:visible; path[role=button] {cursor:pointer;} path:focus-visible {outline:none; stroke-width:18;}`;
const Readout = styled.div`display:grid; > span {grid-area:1/1;} > span[aria-hidden] {visibility:hidden;} min-height:3em; padding:var(--space-1); border-radius:8px; background:var(--neutral-800); overflow-wrap:anywhere;`;
const Legend = styled.ul`list-style:none; padding:0; margin:0;`;
const LegendButton = styled.button`width:100%; min-height:44px; background:transparent; border:1px solid transparent; border-radius:6px; display:grid; grid-template-columns:8px minmax(0,1fr) auto; gap:var(--space-1); align-items:center; text-align:left; white-space:normal; padding:var(--space-1); font-size:var(--font-size-small); color:var(--neutral-100); span {min-width:0; overflow-wrap:anywhere;} b {white-space:nowrap; font-family:var(--font-family-data);} &[aria-pressed=true], &:focus-visible {border-color:var(--royal-300); background:var(--neutral-800);}`;
const Swatch = styled.i`width:8px;height:8px;border-radius:2px;`;
