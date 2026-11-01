import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const js=ts.transpileModule(readFileSync(new URL('../src/pages/payDonutGeometry.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {payDonutGeometry}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
test('proportional arcs reconcile and zero values do not introduce gaps',()=>{
 const arcs=payDonutGeometry([65,0,10,25]);assert.equal(arcs.length,3);assert.deepEqual(arcs.map(a=>a.start),[0,65,75]);assert.equal(arcs.reduce((s,a)=>s+a.value,0),100);
});
test('radial gaps are bounded for tiny adjacent segments without inflating values',()=>{
 const arcs=payDonutGeometry([999998,1,1]);assert.equal(arcs[1].fraction,.000001);assert.ok(arcs.every(a=>a.gap>0&&a.gap<.001));
 assert.equal(payDonutGeometry([100])[0].gap,0);
});
test('invalid, signed and zero totals fail closed',()=>{
 for(const values of [[0,0],[-1,10],[NaN,2],[Infinity],[Number.MAX_SAFE_INTEGER,1]])assert.deepEqual(payDonutGeometry(values),[]);
});
