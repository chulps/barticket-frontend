import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import ts from 'typescript';
const src=readFileSync(new URL('../src/pages/analyticsTicketExport.ts',import.meta.url),'utf8');
const {readCompleteTicketHistory}=await import('data:text/javascript,'+encodeURIComponent(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
test('explicit export loads every paid page not just current page',async()=>{
 const calls=[];const rows=await readCompleteTicketHistory(async(offset,limit)=>{calls.push([offset,limit]);return {offset,total:125,items:Array.from({length:Math.min(limit,125-offset)},(_,i)=>({id:offset+i}))};},()=>true);
 assert.equal(rows.length,125);assert.deepEqual(calls,[[0,100],[100,100]]);
});
test('export rejects concurrent mutation, duplicates, excessive size, incomplete pages and interruption',async()=>{
 for(const total of [5001,101])await assert.rejects(readCompleteTicketHistory(async()=>({offset:0,total,items:[]}),()=>true));
 await assert.rejects(readCompleteTicketHistory(async offset=>({offset,total:150,items:Array.from({length:100},(_,i)=>({id:i}))}),()=>true),/changed/);
 let calls=0;await assert.rejects(readCompleteTicketHistory(async offset=>({offset,total:++calls===1?200:201,items:Array.from({length:100},(_,i)=>({id:offset+i}))}),()=>true),/changed/);
 let active=true;await assert.rejects(readCompleteTicketHistory(async()=>{active=false;return {offset:0,total:0,items:[]};},()=>active),/interrupted/);
});
