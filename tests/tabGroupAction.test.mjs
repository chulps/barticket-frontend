import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the shared component's real handlers without a browser. Browser
// coverage verifies its measured geometry and keyboard focus in the app.
const read = file => readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8');
const navigation = { exports: {} };
new Function('module', 'exports', ts.transpile(read('selectorNavigation.ts'), { module: ts.ModuleKind.CommonJS }))(navigation, navigation.exports);
const source = ts.transpileModule(read('TabGroup.tsx'), { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
    .replace(/^import .*?;\n/gm, '').replace('export default function TabGroup', 'function TabGroup');
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
const styled = new Proxy(() => () => 'element', { get: (_, tag) => () => tag });
const deps = { React, styled, useCallback: callback => callback, useLayoutEffect: () => {}, useRef: current => ({ current }), useState: value => [value, () => {}], ...navigation.exports };
const TabGroup = new Function(...Object.keys(deps), `${source}\nreturn TabGroup;`)(...Object.values(deps));
const all = node => !node || typeof node !== 'object' ? [] : [node, ...(node.props.children ?? []).flat(Infinity).flatMap(all)];

test('Tickets retain the same direct three-button track and pressed semantics', () => {
    const selections = [];
    const tree = TabGroup({ fitLabels: true, label: 'Status', tabs: [{ id: 'open', label: 'Open' }, { id: 'paid', label: 'Paid' }, { id: 'cancelled', label: 'Cancelled' }], activeTab: 'open', onChange: id => selections.push(id) });
    assert.equal(tree.props.role, 'group');
    const track = tree.props.children[0];
    const buttons = all(tree).filter(node => node.type === 'button');
    assert.deepEqual(buttons.map(node => node.props['aria-pressed']), [true, false, false]);
    assert.ok(buttons.every(node => node.props.role === undefined));
    assert.deepEqual(track.props.children.flat(Infinity).filter(node => node?.type === 'button'), buttons);
    buttons[1].props.onClick();
    assert.deepEqual(selections, ['paid']);
    assert.equal(track.props.$fitLabels, true);
});

test('Today is a sibling action using the exact shared button, never a selected third tab', () => {
    const selections = [], actions = [];
    const tree = TabGroup({ fitLabels: true, semantics: 'tabs', idPrefix: 'schedule-view', label: 'Calendar view', tabs: [{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }], activeTab: 'week', onChange: id => selections.push(id), trailingAction: { label: 'Today', onClick: event => actions.push(event) } });
    const buttons = all(tree).filter(node => node.type === 'button');
    const [month, week, today] = buttons;
    const tablist = all(tree).find(node => node.props.role === 'tablist');
    assert.equal(tree.props.role, 'group');
    assert.deepEqual(all(tablist).filter(node => node.type === 'button'), [month, week]);
    assert.deepEqual(buttons.map(node => node.props.children[0]), ['Month', 'Week', 'Today']);
    assert.deepEqual([month.props['aria-selected'], week.props['aria-selected']], [false, true]);
    assert.equal(week.props['aria-controls'], 'schedule-view-panel-week');
    assert.equal(today.props.$active, false);
    for (const key of ['role', 'aria-pressed', 'aria-selected', 'aria-controls', 'tabIndex']) assert.equal(today.props[key], undefined);
    const event = { currentTarget: {} };
    today.props.onClick(event);
    assert.deepEqual(actions, [event]);
    assert.deepEqual(selections, []);
    assert.equal(today.type, month.type);
});

test('view arrow navigation wraps only Month and Week; Tab leaves Today native', () => {
    const changes = [], focused = [];
    const tree = TabGroup({ semantics: 'tabs', tabs: [{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }], activeTab: 'month', onChange: id => changes.push(id), trailingAction: { label: 'Today', onClick: () => assert.fail('Arrow keys cannot invoke Today') } });
    const buttons = all(tree).filter(node => node.type === 'button');
    buttons.slice(0, 2).forEach((button, index) => button.props.ref({ focus: () => focused.push(index) }));
    let prevented = 0;
    buttons[0].props.onKeyDown({ key: 'ArrowRight', preventDefault: () => prevented++ });
    buttons[1].props.onKeyDown({ key: 'ArrowRight', preventDefault: () => prevented++ });
    buttons[1].props.onKeyDown({ key: 'Tab', preventDefault: () => assert.fail('Tab must be native') });
    assert.deepEqual(changes, ['week', 'month']);
    assert.deepEqual(focused, [1, 0]);
    assert.equal(prevented, 2);
    assert.equal(buttons[2].props.onKeyDown, undefined);
});
