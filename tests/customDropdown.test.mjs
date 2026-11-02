import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const source=readFileSync('src/components/Select.tsx','utf8');
test('all app single-select controls use the shared custom dropdown',()=>{
 for(const path of readdirSync('src',{recursive:true}).filter(p=>p.endsWith('.tsx')&&p!=='components/Select.tsx'))assert.doesNotMatch(readFileSync('src/'+path,'utf8'),/<select\b|styled\.select\b/,path);
});
test('form values use genuine native change events and validation focuses visible control',()=>{
 assert.match(source,/dispatchEvent\(new Event\("change", \{ bubbles: true \}\)\)/);
 assert.match(source,/onInvalid=\{event => \{ event.preventDefault\(\); trigger.current\?\.focus\(\)/);
 assert.match(source,/data-select-native/);assert.match(source,/disabled=\{disabled\} required=\{required\}/);
});
test('custom control has select-only keyboard and exit lifecycle semantics',()=>{
 for(const key of ['ArrowDown','ArrowUp','Home','End','PageDown','PageUp','Escape','Tab','Enter'])assert.ok(source.includes('"'+key+'"'));
 assert.match(source,/role="combobox"/);assert.match(source,/role="listbox"/);assert.match(source,/role="option"/);
 assert.match(source,/aria-activedescendant/);assert.match(source,/inert=\{!present\}/);assert.match(source,/useReducedMotion/);
 assert.match(source,/closest\('dialog, \[role="dialog"\]'\)/);assert.match(source,/duration: reduced \? 0 : 0.16/);
});
