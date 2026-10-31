import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../src/'+p,import.meta.url),'utf8');
test('calendar/default selection use lightweight index while detailed reports are scoped',()=>{
 const s=read('pages/Analytics.tsx');
 assert.match(s,/accountApi.analyticsShiftIndex\(\)/);
 assert.match(s,/const initial = current \?\? ordered\[0\]/);
 assert.match(s,/shiftDates=\{\[\.\.\.\(shiftIndex \?\? \[\]\)/);
 assert.match(s,/useAnalyticsReports\(range, periodKey, signedIn\)/);
 assert.match(s,/ticketsReady && reportsReady && !ticketsError && !reportsError/);
 assert.match(s,/err.status !== 404/);
 assert.match(s,/token !== getToken\(\)/);
});
test('report API retains legacy no-param endpoint, scoped date params are encoded',()=>{
 const s=read('api/account.ts');
 assert.match(s,/analyticsShiftIndex:.*\/analytics\/shift-index/);
 assert.match(s,/analyticsShifts: \(scope\?/);
 assert.match(s,/encodeURIComponent\(scope.date_from\)/);
 assert.match(s,/encodeURIComponent\(scope.date_to\)/);
});
