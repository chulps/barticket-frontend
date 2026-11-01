import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = file => readFileSync(new URL('../src/'+file, import.meta.url),'utf8');
test('unverified close-review payment totals never use zero as a fallback',()=>{
 const s=source('pages/ShiftCloseReview.tsx');
 for(const key of ['paidTotal','cash','card','other']) {
  assert.ok(s.includes(`live ? yen(live.${key}) : "—"`));
  assert.ok(!s.includes(`live?.${key} ?? 0`));
 }
 assert.match(s,/Collected totals, carry balances and close eligibility are unavailable/);
 assert.match(s,/入金額、繰越残高と閉店可否を確認できません/);
});
test('both chart clipboard entrypoints disclose failure with selectable localized text',()=>{
 const s=source('components/AnalyticsCharts.tsx');
 assert.equal((s.match(/setFailedCopy\(text\)/g)||[]).length,2);
 assert.equal((s.match(/<ManualCopyDialog text=\{failedCopy\}/g)||[]).length,2);
 assert.match(s,/readOnly value=\{text\}/);assert.match(s,/Couldn’t copy automatically/);assert.match(s,/自動コピーできませんでした/);
 assert.match(s,/showModal\(\)/);assert.match(s,/onCancel=\{event => \{ event.preventDefault\(\); onClose\(\); \}\}/); assert.match(s,/onClick=\{onClose\}/);
 assert.match(s,/if \(!event.currentTarget.open\) onClose\(\)/);
});
test('account autosave reports state, preserves draft on failure and disables conflicts',()=>{
 const s=source('pages/Profile.tsx');
 assert.match(s,/value=\{nameDraft \?\? account.name\}/);
 assert.match(s,/onBlur=\{saveName\}/);
 assert.match(s,/Name not saved. Your edit is still here/);
 assert.match(s,/名前は保存されていません/);
 for(const marker of ['{t("newPassword")}','<SignOutButton','className="secondary"']){
  const start=s.indexOf(marker,s.indexOf('aria-describedby="account-name-status"'));
  assert.ok(s.slice(start,start+250).includes('disabled={busy}'),marker);
 }
 assert.match(s,/if \(token !== getToken\(\)\) return/);
});
test('recent-only feed cue does not claim full shift completeness after filtering',()=>{
 const s=source('components/NotificationActivity.tsx');
 assert.match(s,/Recent activity only \(up to 200 events\)/);
 assert.match(s,/最大200件/);assert.match(s,/No additional items in recent activity/);
 assert.match(s,/Closed-shift history is available in Analytics/);
});

test('clipboard request generations and account changes reject stale feedback',()=>{
 const charts=source('components/AnalyticsCharts.tsx');
 assert.equal((charts.match(/const copyRequest = useRef\(0\)/g)||[]).length,2);
 assert.match(charts,/request !== copyRequest.current/);
 assert.equal((charts.match(/request === copyRequest.current/g)||[]).length,3);
 assert.match(charts,/document.body.style.overflow = overflow/);
 assert.match(charts,/useLayoutEffect\(\(\) => \{\s*const element = dialog.current/);
 const profile=source('pages/Profile.tsx');
 assert.match(profile,/addEventListener\("barticket-auth", authChanged\)/);
 assert.match(profile,/function authChanged\(\) \{\s*setNameDraft\(null\);\s*setNameSaveState\("idle"\);\s*setPassword\(""\);\s*setAccount\(null\);/);
});
