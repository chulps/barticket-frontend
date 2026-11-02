import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
const source=readFileSync(new URL('../src/api/releaseHistory.ts',import.meta.url),'utf8').replace('import.meta.env.BASE_URL','"/barticket-frontend/"');
function module(fetch){const m={exports:{}};runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,TextEncoder,fetch});return m.exports;}
const entry=(id='1:1',sha='a'.repeat(40),builtAt='2026-11-02T13:00:00Z')=>({id,sha,builtAt});
test('release history validates and deduplicates without mutable local state',()=>{
 const {parseReleaseHistory}=module();
 assert.equal(parseReleaseHistory({schema:1,releases:[entry(),entry()]}).releases.length,1);
 assert.equal(parseReleaseHistory({schema:1,releases:[entry(),entry('2:1','b'.repeat(40),'2026-11-03T13:00:00Z')]}).releases[0].id,'2:1');
 for(const bad of [null,{}, {schema:2,releases:[]},{schema:1,releases:[entry('x')]},{schema:1,releases:[entry('1:1','<script>')]},{schema:1,releases:[entry('1:1','a'.repeat(40),'2026-02-31T00:00:00Z')]},{schema:1,releases:[entry(),entry('1:1','b'.repeat(40))]}])assert.throws(()=>parseReleaseHistory(bad));
 assert.equal(parseReleaseHistory({schema:1,releases:[]}).releases.length,0);
});
test('fetch is same-origin metadata, uncached, abortable and carries no API token',async()=>{
 const calls=[],signal=new AbortController().signal;
 const api=module(async(...args)=>{calls.push(args);return {ok:true,headers:{get:()=> 'application/json'},text:async()=>JSON.stringify({schema:1,releases:[entry()]})};});
 assert.equal((await api.loadReleaseHistory(signal)).releases.length,1);
 assert.equal(calls[0][0],'/barticket-frontend/release-history.json');assert.equal(calls[0][1].cache,'no-store');assert.equal(calls[0][1].credentials,'omit');assert.equal(calls[0][1].signal,signal);assert.equal(calls[0][1].headers,undefined);
});
test('missing, HTML fallback, invalid and oversized responses remain errors, never fake empty success',async()=>{
 for(const response of [{ok:false},{ok:true,headers:{get:()=> 'text/html'}},{ok:true,headers:{get:()=> 'application/json'},text:async()=>'{bad'},{ok:true,headers:{get:()=> 'application/json'},text:async()=> ' '.repeat(2097153)}])await assert.rejects(module(async()=>response).loadReleaseHistory(new AbortController().signal));
});
test('production ledger archive, retry, rollback and failure isolation regressions',()=>{
 const result=spawnSync('python3',['tests/release_history_test.py'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
});
test('workflow history uses only successful main deploys and preserves current asset continuity',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');
 assert.match(workflow,/run.head_branch === 'main' && run.conclusion === 'success'/);
 assert.match(workflow,/run.run_attempt === 1/);
 assert.match(workflow,/cancel-in-progress: false/);
 assert.match(workflow,/live = await fetch/);
 assert.match(workflow,/python3 scripts\/retain-pages-assets.py previous-pages dist/);
 assert.ok(workflow.indexOf('prepare-release-history.py')<workflow.indexOf('actions/upload-pages-artifact'));
 assert.match(workflow,/contents: read/);assert.doesNotMatch(workflow,/contents: write|secrets\./);
});
