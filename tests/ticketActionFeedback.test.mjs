import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/pages/ticketActionFeedback.ts', import.meta.url), 'utf8');
const mod = { exports: {} };
runInNewContext(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:mod,exports:mod.exports});
const { confirmedTicketCue: cue } = mod.exports;
test('only confirmed, real ticket IDs can produce cues',()=>{
  for(const action of ['created','paid','cancelled','reopened']) {
    assert.equal(cue(action,null),null);
    for(const id of [-.5,0,NaN]) assert.equal(cue(action,{id,status:'open'}),null);
  }
});
test('all four lifecycle actions require their actual server status',()=>{
  for(const [action,status] of [['created','open'],['reopened','open'],['cancelled','cancelled'],['paid','paid']])
    assert.equal(cue(action,{id:11,status}),action);
  assert.equal(cue('cancelled',{id:11,status:'open'}),null);
  assert.equal(cue('reopened',{id:11,status:'paid'}),null);
  assert.equal(cue('created',{id:11,status:'cancelled'}),null);
});
test('partial, written-off and unresolved settlements are not celebrated as fully paid',()=>{
  for(const ticket of [{status:'open',balanceDue:200},{status:'paid',balanceDue:1},
    {status:'paid',settlementStatus:'written_off'},{status:'paid',settlementStatus:'partially_paid'}])
    assert.equal(cue('paid',{id:11,...ticket}),'payment-recorded');
  assert.equal(cue('paid',{id:11,status:'paid',balanceDue:0,settlementStatus:'settled'}),'paid');
  assert.equal(cue('paid',{id:11,status:'cancelled'}),null);
});
test('feedback lives outside data refresh and never remounts the detail ticket',()=>{
  const dash=readFileSync(new URL('../src/pages/Dashboard.tsx',import.meta.url),'utf8');
  const hooks=readFileSync(new URL('../src/hooks/useTickets.ts',import.meta.url),'utf8');
  assert.doesNotMatch(hooks,/confirmAction|confirmedTicketCue/);
  assert.match(dash,/key=\{selectedTicket.id\}/);
  assert.match(dash,/setActiveTab\(saved.status\)/);
  assert.match(dash,/if \(!saved \|\| paymentSession.current !== startedSession\) return null;\s*if \(paymentView.current !== startedView\) return saved;\s*confirmAction\("paid", saved\)/);
  const css=readFileSync(new URL('../src/components/TicketActionFeedback.css',import.meta.url),'utf8');
  assert.match(css,/pointer-events: none/);
  assert.match(css,/prefers-reduced-motion: reduce/);
});
