import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src = path => readFileSync(new URL('../src/'+path,import.meta.url),'utf8');
test('work history uses two mobile period columns and legible metric labels without replacing motion',()=>{
 const history=src('pages/StaffWorkHistory.tsx');
 assert.match(history,/label=\{ja \? "表示期間" : "Time scale"\}\s+mobileColumns=\{2\}/);
 assert.match(history,/span \{ color: var\(--neutral-200\); \}/);
 assert.match(src('components/TabGroup.tsx'),/cubic-bezier\(0.34, 1.56, 0.64, 1\)/);
});
test('payment draft edits invalidate confirmed success but preserve uncertain-save state',()=>{
 const payments=src('pages/AdminPayments.tsx');
 assert.match(payments,/const editDraft = \(\) => setMessage\(current => current === "saved" \? "" : current\)/);
 assert.equal((payments.match(/editDraft\(\);/g)||[]).length,4);
 assert.match(payments,/const disabled = busy \|\| needsReload/);
 assert.match(payments,/setMessage\("uncertain"\); setNeedsReload\(true\)/);
});
test('stock failure has persistent item-specific refresh recovery without automatic mutation replay',()=>{
 const menu=src('pages/Menu.tsx');
 assert.match(menu,/setStockErrors\(items => \[\.\.\.items.filter\(row => row.id !== item.id\), item\]\)/);
 assert.match(menu,/authenticated && stockErrors.length > 0/);
 assert.match(menu,/Refresh the menu and check stock before trying again/);
 assert.match(menu,/onClick=\{retryMenu\}[^\n]*"Refresh menu"/);
 assert.match(menu,/stockErrors.map\(item => <li key=\{item.id\}>/);
 assert.match(menu,/setStockErrors\(items => items.filter\(row => row.id !== item.id\)\)/);
 assert.doesNotMatch(menu,/setTimeout\([^)]*setStockErrors/s);
});
test('declared dark metric label token pair meets normal-text contrast',()=>{
 const css=src('index.css');
 const color=name=>css.match(new RegExp('--'+name+': (#[a-fA-F0-9]{6});'))[1];
 const luminance=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
 const ratio=(front,back)=>(luminance(color(front))+0.05)/(luminance(color(back))+0.05);
 assert.ok(ratio('neutral-200','neutral-800')>=4.5);
 // Secondary labels on the existing page surface already pass; avoid palette churn.
 assert.ok(ratio('neutral-300','neutral-900')>=4.5);
});

test('enabled inactive shared selectors retain readable neutral text without changing active emphasis',()=>{
 const tabs=src('components/TabGroup.tsx');
 assert.match(tabs,/\$active \? "white" : "var\(--neutral-200\)"/);
 assert.match(tabs,/background: var\(--neutral-800\)/);
});
