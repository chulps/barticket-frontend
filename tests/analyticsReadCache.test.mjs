import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const src=readFileSync(new URL('../src/hooks/analyticsReadCache.ts',import.meta.url),'utf8');
const {createAnalyticsReadCache}=await import('data:text/javascript,'+encodeURIComponent(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
test('repeat scope reads coalesce and cache until TTL; entries evict at bound',async()=>{
 let now=0,loads=0;const cache=createAnalyticsReadCache(2,30,()=>now);const load=async()=>++loads;
 assert.deepEqual(await Promise.all([cache.read('A','1',load),cache.read('A','1',load)]),[1,1]);
 assert.equal(await cache.read('A','1',load),1);now=31;assert.equal(await cache.read('A','1',load),2);
 await cache.read('A','2',load);await cache.read('A','3',load);assert.equal(await cache.read('A','1',load),5);
});
test('identity change and explicit mutation clear cache; old in-flight result cannot repopulate',async()=>{
 const cache=createAnalyticsReadCache();let resolve;const old=cache.read('A','p',()=>new Promise(r=>resolve=r));
 cache.clear();resolve('old');await assert.rejects(old,/invalidated/);
 assert.equal(await cache.read('A','p',async()=> 'new'),'new');
 assert.equal(await cache.read('B','p',async()=> 'private B'),'private B');
});
test('rejected reads are not cached and can retry',async()=>{
 const cache=createAnalyticsReadCache();await assert.rejects(cache.read('A','p',async()=>{throw Error('offline');}));
 assert.equal(await cache.read('A','p',async()=>42),42);
});
test('history paging is server-side and does not slice analytics totals',()=>{
 const page=readFileSync(new URL('../src/pages/Analytics.tsx',import.meta.url),'utf8');
 assert.match(page,/analyticsPath\('ticket-history'/);assert.match(page,/limit:'25'/);
 assert.match(page,/useAnalyticsTickets\(range, periodKey, signedIn && range === "day"\)/);
 assert.match(page,/summary=\{itemSummary.value/);assert.match(page,/Copy paid tickets on this page/);
 const hook=readFileSync(new URL('../src/hooks/useAnalyticsData.ts',import.meta.url),'utf8');
 for(const event of ['barticket-data-changed','barticket-auth','barticket-push','barticket-users-updated'])assert.ok(hook.includes(event));
 assert.match(hook,/snapshot.token===getToken\(\)/);assert.doesNotMatch(hook,/localStorage.set|sessionStorage/);
});
