import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SelectHTMLAttributes, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import styled from "styled-components";
import Icon from "./Icon";

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, "multiple" | "size" | "onKeyDown" | "onFocus" | "onBlur">;
type Choice = { value: string; label: string; disabled: boolean; group?: string };
function text(node: ReactNode): string {
    return Children.toArray(node).map(child => isValidElement<{ children?: ReactNode }>(child) ? text(child.props.children) : String(child)).join("");
}
function choices(children: ReactNode, group?: string, groupDisabled = false): Choice[] {
    return Children.toArray(children).flatMap(child => {
        if (!isValidElement<{ children?: ReactNode; value?: string | number; label?: string; disabled?: boolean }>(child)) return [];
        if (child.type === Fragment) return choices(child.props.children, group, groupDisabled);
        if (child.type === "optgroup") return choices(child.props.children, child.props.label, groupDisabled || !!child.props.disabled);
        if (child.type !== "option") return [];
        const label = child.props.label ?? text(child.props.children);
        return [{ value: String(child.props.value ?? label), label, disabled: groupDisabled || !!child.props.disabled, group }];
    });
}

/** Select-only combobox. The hidden native select remains the form/change-event
 * bridge; consumers keep their actual values, validation and change callbacks. */
export default function Select({ children, value, defaultValue, disabled, required, id, className, style, onInvalid, onChange, ...props }: Props) {
    const generated = useId();
    const controlId = id ?? `select-${generated}`;
    const listId = `${controlId}-options`;
    const native = useRef<HTMLSelectElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const options = useMemo(() => choices(children), [children]);
    const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? options[0]?.value ?? ""));
    const current = String(value ?? uncontrolled);
    const selected = options.findIndex(option => option.value === current);
    const [validation, setValidation] = useState("");
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const [placement, setPlacement] = useState({ left: 0, top: 0, width: 0, height: 320, above: false });
    const [host, setHost] = useState<Element | null>(null);
    const activeValue = useRef<string | undefined>(undefined);
    const lastValue = useRef(current);
    const search = useRef({ text: "", time: 0 });
    const reduced = useReducedMotion();
    const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    const expanded = open && !disabled;

    function activate(index: number) { activeValue.current = options[index]?.value; setActive(index); }
    function begin(index = selected >= 0 && !options[selected]?.disabled ? selected : enabled[0] ?? -1) {
        if (disabled || native.current?.matches(":disabled") || !enabled.length) return;
        // Portals must stay in the nearest modal's DOM subtree, especially a
        // native dialog's top layer. Focus remains on the combobox trigger.
        setHost(trigger.current?.closest('dialog, [role="dialog"]') ?? document.body);
        activate(index);
        setOpen(true);
    }
    function commit(index: number) {
        const option = options[index];
        if (!option || option.disabled || disabled || !native.current || native.current.matches(":disabled")) return;
        if (option.value !== current) {
            native.current.value = option.value;
            setUncontrolled(option.value);
            // A real select change event preserves currentTarget, capture-phase
            // dirty-form handlers and existing React onChange behavior.
            native.current.dispatchEvent(new Event("change", { bubbles: true }));
        }
        setOpen(false);
    }
    function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (disabled || native.current?.matches(":disabled")) return;
        const key = event.key;
        if (key === "Escape" && expanded) {
            event.preventDefault(); event.stopPropagation(); setOpen(false); return;
        }
        if (key === "Tab") { if (expanded) commit(active); return; }
        if (key === "Enter" || key === " ") {
            event.preventDefault(); if (expanded) commit(active); else begin(); return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(key)) {
            event.preventDefault();
            let index = expanded ? active : selected;
            const position = enabled.indexOf(index);
            if (key === "Home") index = enabled[0];
            else if (key === "End") index = enabled.at(-1)!;
            else if (!expanded) index = selected >= 0 ? selected : enabled[0];
            else {
                const delta = key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : key === "PageDown" ? 10 : -10;
                index = enabled[Math.max(0, Math.min(enabled.length - 1, position + delta))];
            }
            if (expanded) activate(index); else begin(index);
            return;
        }
        if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const now = event.timeStamp;
            const previous = now - search.current.time < 700 ? search.current.text : "";
            const query = (previous + key).toLocaleLowerCase();
            search.current = { text: query, time: now };
            const repeated = [...query].every(char => char === query[0]);
            const needle = repeated ? query[0] : query;
            const start = repeated ? (expanded ? active : selected) + 1 : 0;
            const candidates = [...options.keys()].map(index => (index + start + options.length) % options.length);
            const match = candidates.find(index => !options[index].disabled && options[index].label.toLocaleLowerCase().startsWith(needle));
            if (match !== undefined) { if (expanded) activate(match); else begin(match); }
        }
    }

    // A newly disabled control closes permanently, not only visually.
    if (disabled && open) setOpen(false);
    useLayoutEffect(() => {
        const changed = lastValue.current !== current;
        lastValue.current = current;
        if (!expanded) return;
        const previous = options.findIndex(option => option.value === activeValue.current && !option.disabled);
        const next = !changed && previous >= 0 ? previous : options.findIndex(option => option.value === current && !option.disabled);
        const index = next >= 0 ? next : options.findIndex(option => !option.disabled);
        activeValue.current = options[index]?.value;
        setActive(index);
        if (index < 0) setOpen(false);
    }, [current, options, expanded]);
    useEffect(() => {
        const form = native.current?.form;
        const reset = (event: Event) => queueMicrotask(() => {
            if (event.defaultPrevented) return;
            const resetValue = String(value ?? defaultValue ?? options[0]?.value ?? "");
            setUncontrolled(resetValue);
            setValidation("");
            if (native.current) native.current.value = resetValue;
            setOpen(false);
        });
        form?.addEventListener("reset", reset);
        return () => form?.removeEventListener("reset", reset);
    }, [value, defaultValue, options]);

    useLayoutEffect(() => {
        if (!expanded) return;
        const place = () => {
            if (!trigger.current) return;
            const rect = trigger.current.getBoundingClientRect();
            const viewport = window.visualViewport;
            const leftEdge = (viewport?.offsetLeft ?? 0) + 12;
            const topEdge = (viewport?.offsetTop ?? 0) + 12;
            const rightEdge = leftEdge + (viewport?.width ?? innerWidth) - 24;
            const bottomEdge = topEdge + (viewport?.height ?? innerHeight) - 24;
            const below = bottomEdge - rect.bottom - 6;
            const above = rect.top - topEdge - 6;
            const upwards = below < 200 && above > below;
            const height = Math.max(44, Math.min(320, upwards ? above : below));
            const width = Math.min(Math.max(rect.width, 240), rightEdge - leftEdge);
            setPlacement({ left: Math.max(leftEdge, Math.min(rect.left, rightEdge - width)), top: upwards ? Math.max(topEdge, rect.top - 6) : Math.max(topEdge, rect.bottom + 6), width, height, above: upwards });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        window.visualViewport?.addEventListener("resize", place);
        window.visualViewport?.addEventListener("scroll", place);
        return () => {
            window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true);
            window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place);
        };
    }, [expanded]);
    useLayoutEffect(() => {
        if (expanded) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }, [active, expanded, listId]);
    useEffect(() => {
        if (!expanded) return;
        const outside = (event: PointerEvent) => {
            if (event.target instanceof Node && !trigger.current?.contains(event.target) && !list.current?.contains(event.target)) setOpen(false);
        };
        const back = () => setOpen(false);
        const disabledObserver = new MutationObserver(() => {
            if (native.current?.matches(":disabled")) setOpen(false);
        });
        for (let parent = native.current?.parentElement; parent; parent = parent.parentElement) {
            if (parent.tagName === "FIELDSET") disabledObserver.observe(parent, { attributes: true, attributeFilter: ["disabled"] });
        }
        document.addEventListener("pointerdown", outside, true);
        window.addEventListener("popstate", back);
        return () => { disabledObserver.disconnect(); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("popstate", back); };
    }, [expanded]);

    function renderOption(option: Choice, index: number) {
        return <Option key={`${option.value}-${index}`} id={`${listId}-${index}`} role="option" aria-selected={current === option.value}
            aria-disabled={option.disabled || undefined} data-option-value={option.value} $active={index === active}
            onPointerDown={event => event.preventDefault()}
            onClick={event => { event.preventDefault(); event.stopPropagation(); commit(index); trigger.current?.focus({ preventScroll: true }); }}>
            <span>{option.label}</span><span aria-hidden="true">{current === option.value && <Icon name="Check" size={18} />}</span>
        </Option>;
    }

    return <>
        <Trigger ref={trigger} id={controlId} className={className} style={style} type="button" role="combobox"
            data-select-trigger data-select-value={current} disabled={disabled} aria-label={props["aria-label"]}
            aria-labelledby={props["aria-labelledby"]} aria-describedby={[props["aria-describedby"], validation && !current ? `${controlId}-error` : undefined].filter(Boolean).join(" ") || undefined}
            aria-invalid={props["aria-invalid"] || (validation && !current ? true : undefined)} aria-required={required} aria-haspopup="listbox"
            aria-expanded={expanded} aria-controls={expanded ? listId : undefined}
            aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
            onKeyDown={keyDown} onBlur={() => { if (expanded) setOpen(false); }}
            onClick={() => { if (expanded) setOpen(false); else begin(); }}>
            <span>{options[selected]?.label ?? ""}</span>
            <Caret $open={expanded} aria-hidden="true"><Icon name="CaretDown" size={18} /></Caret>
        </Trigger>
        <select {...props} ref={native} value={value ?? uncontrolled} disabled={disabled} required={required}
            aria-hidden="true" tabIndex={-1} style={{ display: "none" }} data-select-native
            onChange={event => { setValidation(""); onChange?.(event); }}
            onInvalid={event => { event.preventDefault(); trigger.current?.focus(); setValidation(event.currentTarget.validationMessage); onInvalid?.(event); }}>
            {children}
        </select>
        {validation && !current && <span id={`${controlId}-error`} role="alert">{validation}</span>}
        {host && createPortal(<AnimatePresence>
            {expanded && <Popup key={listId} listRef={list} id={listId} label={props["aria-label"]} labelledBy={props["aria-labelledby"]}
                placement={placement} reduced={!!reduced}>
                {options.map((option, index) => {
                    if (option.group && options[index - 1]?.group === option.group) return null;
                    if (!option.group) return renderOption(option, index);
                    const groupOptions = options.slice(index).findIndex(item => item.group !== option.group);
                    const end = groupOptions < 0 ? options.length : index + groupOptions;
                    return <div role="group" aria-label={option.group} key={`group-${index}`}>
                        <GroupLabel aria-hidden="true">{option.group}</GroupLabel>
                        {options.slice(index, end).map((item, offset) => renderOption(item, index + offset))}
                    </div>;
                })}
            </Popup>}
        </AnimatePresence>, host)}
    </>;
}

type PopupProps = { children: ReactNode; listRef: React.RefObject<HTMLDivElement | null>; id: string; label?: string; labelledBy?: string; reduced: boolean; placement: { left: number; top: number; width: number; height: number; above: boolean } };
function Popup({ children, listRef, id, label, labelledBy, reduced, placement }: PopupProps) {
    const present = useIsPresent();
    return <PopupAnchor style={{ left: placement.left, top: placement.top, width: placement.width, transform: placement.above ? "translateY(-100%)" : undefined }}>
        <Panel ref={listRef} id={id} role="listbox" aria-label={label} aria-labelledby={labelledBy}
            aria-hidden={!present || undefined} inert={!present} style={{ maxHeight: placement.height, pointerEvents: present ? "auto" : "none", transformOrigin: placement.above ? "bottom" : "top" }}
            initial={reduced ? false : { opacity: 0, y: placement.above ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduced ? 0 : placement.above ? 3 : -3, scale: reduced ? 1 : 0.99 }}
            transition={{ duration: reduced ? 0 : 0.16, ease: [0.2, 0, 0, 1] }}>{children}</Panel>
    </PopupAnchor>;
}
const Trigger = styled.button`
    && { box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-width: 0; min-height: 44px;
        padding: 10px 12px; border: 1px solid var(--neutral-500); border-radius: 10px; background: var(--neutral-900);
        color: var(--white); font-family: inherit; font-size: var(--font-size-default); font-weight: 400; line-height: 1.5;
        text-align: start; white-space: normal; box-shadow: none; transform: none; filter: none; cursor: pointer; }
    && > span:first-child { min-width: 0; overflow-wrap: anywhere; }
    &&:hover:not(:disabled) { background: var(--neutral-800); }
    &&:focus-visible { outline: 2px solid var(--royal-300); outline-offset: 2px; }
    &&:disabled { opacity: .55; cursor: not-allowed; }
    html.light &&&& { background: var(--neutral-050); color: var(--neutral-600); }
    @media (forced-colors: active) { && { border: 1px solid ButtonText; } &&:focus-visible { outline-color: Highlight; } }
`;
const Caret = styled.span<{ $open: boolean }>`
    display: inline-flex; flex: 0 0 18px; transform: rotate(${({ $open }) => $open ? 180 : 0}deg);
    @media (prefers-reduced-motion: no-preference) { transition: transform 160ms ease-out; }
`;
const PopupAnchor = styled.div`position: fixed; z-index: 2000; min-width: 0;`;
const Panel = styled(motion.div)`
    box-sizing: border-box; overflow-y: auto; overscroll-behavior: contain; padding: 4px; border-radius: 14px;
    border: 1px solid var(--neutral-600); background: var(--neutral-900); color: var(--white);
    box-shadow: 0 12px 32px #0006, 0 2px 6px #0003; font-size: var(--font-size-default); line-height: 1.5;
    html.light & { background: var(--neutral-050); color: var(--neutral-600); }
    @media (forced-colors: active) { border-color: CanvasText; }
`;
const Option = styled.div<{ $active: boolean }>`
    display: grid; grid-template-columns: minmax(0, 1fr) 18px; align-items: center; gap: 12px; box-sizing: border-box;
    min-height: 44px; padding: 10px 12px; border-radius: 10px; overflow-wrap: anywhere; cursor: pointer;
    background: ${({ $active }) => $active ? "var(--neutral-700)" : "transparent"};
    &[aria-selected="true"] { font-weight: 600; }
    &:hover:not([aria-disabled="true"]) { background: var(--neutral-700); }
    &[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
    html.light & { background: ${({ $active }) => $active ? "var(--neutral-100)" : "transparent"}; }
    html.light &:hover:not([aria-disabled="true"]) { background: var(--neutral-100); }
    @media (forced-colors: active) { background: ${({ $active }) => $active ? "Highlight" : "Canvas"}; color: ${({ $active }) => $active ? "HighlightText" : "CanvasText"}; }
`;
const GroupLabel = styled.div`padding: 8px 12px 4px; font-weight: 600; font-size: var(--font-size-small);`;
