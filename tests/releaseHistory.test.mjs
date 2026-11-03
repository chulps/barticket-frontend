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
test('release history preserves ids, timestamps and order when summaries are looked up',()=>{
 const {parseReleaseHistory}=module();
 const rows=[
  entry('41462471234:1','d'.repeat(40),'2026-11-02T14:31:01Z'),
  entry('41491540667:1','c'.repeat(40),'2026-11-02T13:00:00Z'),
  entry('41503199084:1','b'.repeat(40),'2026-11-02T12:00:00Z'),
 ];
 const result=parseReleaseHistory({schema:1,releases:rows});
 const releaseIdentity=result.releases.map(({id,sha,builtAt})=>({id,sha,builtAt}));
 assert.deepEqual(JSON.parse(JSON.stringify(releaseIdentity)),rows);
});
test('reviewed release notes are exact, bilingual entries for the three shipped commits',()=>{
 const noteSource=readFileSync(new URL('../src/api/releaseNotes.ts',import.meta.url),'utf8');
 const m={exports:{}};
 runInNewContext(ts.transpileModule(noteSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports});
 const {getReleaseNote,RELEASE_NOTES}=m.exports;
 const shas=[
  'd48c8f9894502486d99b64ba9145893520a8adc9',
  '532b62443f541d3fa7e3e07a1ef5194bb22f8926',
  '49af03e855fbafdf780913ae4fd4b25420725994',
 ];
 assert.deepEqual(Object.keys(RELEASE_NOTES).sort(),shas.slice().sort());
 for(const sha of shas){
  const note=getReleaseNote(sha);
  assert.ok(note.title.en.length>0&&note.title.ja.length>0);
  assert.ok(note.features.en.length>0&&note.features.ja.length>0);
  assert.equal(note.features.en.length,note.features.ja.length);
 }
 const expectedHighlights=[
  [/Plan and edit schedules/,/月表示または予定一覧/],
  [/Sound settings now include/,/サウンド設定で/],
  [/Notification activity now shows ticket names/,/通知の履歴にチケット名/],
 ];
 assert.match(getReleaseNote(shas[0]).title.en,/Schedule calendar/);
 assert.match(getReleaseNote(shas[1]).title.en,/Sound settings.*Team Pay/);
 assert.match(getReleaseNote(shas[2]).title.en,/Notifications.*app update history/);
 shas.forEach((sha,index)=>{
  assert.ok(getReleaseNote(sha).features.en.some(text=>expectedHighlights[index][0].test(text)));
  assert.ok(getReleaseNote(sha).features.ja.some(text=>expectedHighlights[index][1].test(text)));
 });
 const unknownPrefixCollision='d48c8f9'+'0'.repeat(33);
 assert.equal(getReleaseNote(unknownPrefixCollision),undefined);
});
test('untrusted release metadata is stripped and malformed entries remain rejected',()=>{
 const {parseReleaseHistory}=module();
 const row={...entry(),title:'<script>alert(1)</script>',features:['unreviewed claim']};
 assert.deepEqual(JSON.parse(JSON.stringify(parseReleaseHistory({schema:1,releases:[row]}).releases)),[entry()]);
 for(const bad of [
  {schema:1,releases:[{...entry(),sha:'not-a-commit'}]},
  {schema:1,releases:[{...entry(),builtAt:'2026-02-31T00:00:00Z'}]},
  {schema:1,releases:[{...entry(),id:'release:1'}]},
 ]) assert.throws(()=>parseReleaseHistory(bad));
});
test('a validated build-attached note is preserved and malformed notes fail closed',()=>{
 const {parseReleaseHistory}=module();
 const note={title:{en:'Clearer app updates',ja:'アプリ更新内容'},features:{en:['App updates explain this release.'],ja:['このリリースの内容を表示します。']}};
 const row={...entry(),note};
 assert.deepEqual(JSON.parse(JSON.stringify(parseReleaseHistory({schema:1,releases:[row]}).releases)),[row]);
 for(const badNote of [
  {title:'bad',features:{en:['x'],ja:['y']}},
  {title:{en:'ok',ja:'良い'},features:{en:[],ja:[]}},
  {title:{en:'ok',ja:'良い'},features:{en:['x'],ja:['一','二']}},
  {title:{en:'ok',ja:'良い'},features:{en:['x'.repeat(181)],ja:['短い']}},
 ]) assert.throws(()=>parseReleaseHistory({schema:1,releases:[{...entry(),note:badNote}]}));
});
test('current release note manifest is bilingual, reviewed, and contains only feature copy',()=>{
 const current=JSON.parse(readFileSync(new URL('../scripts/release-note.json',import.meta.url),'utf8'));
 assert.deepEqual(Object.keys(current).sort(),['features','title']);
 assert.ok(current.title.en.length&&current.title.ja.length);
 assert.ok(current.features.en.length>0&&current.features.en.length<=5);
 assert.equal(current.features.en.length,current.features.ja.length);
 assert.match(current.title.en,/Request time off from your manager/);
 assert.match(current.features.en.join(' '),/optional time-off request.*manager assigned to their scheduled day.*approve or decline.*planned assignment.*notify the staff member/i);
 assert.match(current.features.ja.join(' '),/予定日の担当マネージャー.*任意の休暇申請.*承認または却下.*予定の担当者が更新.*スタッフに通知/);
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
 assert.match(workflow,/fetch-depth: 2/);
 assert.match(workflow,/scripts\/release-note\.json/);
 assert.match(workflow,/current-note\.json/);
 assert.match(workflow,/python3 scripts\/retain-pages-assets.py previous-pages dist/);
 assert.ok(workflow.indexOf('prepare-release-history.py')<workflow.indexOf('actions/upload-pages-artifact'));
 assert.match(workflow,/contents: read/);assert.doesNotMatch(workflow,/contents: write|secrets\./);
});
