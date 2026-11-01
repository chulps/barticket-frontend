/** Full proportional arcs; radial mask cuts never consume an entire small segment. */
export function payDonutGeometry(values: number[]) {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!Number.isSafeInteger(total) || total <= 0 || values.some(value => !Number.isSafeInteger(value) || value < 0)) return [];
    let offset = 0;
    const arcs = values.map((value, index) => {
        const start = offset;
        offset += value;
        return { index, value, start, angle: start / total * 360, fraction: value / total, total };
    }).filter(arc => arc.value > 0);
    return arcs.map((arc, index) => {
        const previous = arcs[(index + arcs.length - 1) % arcs.length];
        // At inner radius 35, cut width is capped to 1/4 of the smaller adjacent arc.
        const gap = arcs.length === 1 ? 0 : Math.min(1.875, Math.min(arc.fraction, previous.fraction) * 2 * Math.PI * 35 / 4);
        const startAngle = arc.angle * Math.PI / 180;
        const endAngle = (arc.start + arc.value) / total * 2 * Math.PI;
        const point = (angle: number) => `${60 + 42 * Math.cos(angle)},${60 + 42 * Math.sin(angle)}`;
        const path = arc.value === total
            ? "M102,60 A42,42 0 1 1 18,60 A42,42 0 1 1 102,60"
            : `M${point(startAngle)} A42,42 0 ${arc.fraction > .5 ? 1 : 0} 1 ${point(endAngle)}`;
        return { ...arc, gap, path };
    });
}
