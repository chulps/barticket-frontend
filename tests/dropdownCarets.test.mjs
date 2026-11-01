import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const css=readFileSync('src/index.css','utf8');
test('all native dropdowns share the canonical regular Phosphor caret and spacing',()=>{
 assert.match(css,/--dropdown-caret-size: 18px/);
 assert.match(css,/background-image: var\(--dropdown-caret-image\) !important/);
 assert.match(css,/padding-right: calc\(var\(--dropdown-caret-inset\) \+ var\(--dropdown-caret-size\) \+ var\(--dropdown-caret-gap\)\)/);
 const phosphor=readFileSync('node_modules/@phosphor-icons/react/dist/defs/CaretDown.es.js','utf8');
 const path=css.match(/%3Cpath d='([^']+)'/)[1];assert.ok(phosphor.includes(path));
 assert.match(css,/@media \(forced-colors: active\)/);
});
test('no platform-dependent text carets remain on select controls',()=>{
 for(const file of readdirSync('src',{recursive:true}).filter(f=>f.endsWith('.tsx'))){
  assert.doesNotMatch(readFileSync('src/'+file,'utf8'),/>[▾⌄▼]</,file);
 }
});
test('overflow actions and unrelated quantity arrows stay intact',()=>{
 const item=readFileSync('src/components/TicketDetails/TicketItem.tsx','utf8');
 assert.match(item,/DotsThreeOutlineVertical/);assert.match(item,/name="CaretUp"/);assert.match(item,/name="CaretDown"/);
});

test('dark and light native indicators share geometry and match theme foreground',()=>{
 const paths=[...css.matchAll(/%3Cpath d='([^']+)'/g)].map(match=>match[1]);assert.equal(paths.length,2);assert.equal(new Set(paths).size,1);
 assert.match(css,/fill='%23f5f5f5'/);assert.match(css,/:root\.light \{[\s\S]*?fill='%234c4f55'/);
});

test('light native and styled selects have an opaque matching control palette',()=>{
 assert.match(css,/html\.light select[\s\S]*?background-color: var\(--neutral-050\) !important;[\s\S]*?color: var\(--neutral-600\) !important/);
 const download=readFileSync('src/components/DataDownload.tsx','utf8');assert.match(download,/max-width: 100%/);assert.match(download,/white-space: normal/);
});
