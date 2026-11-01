import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
test('discard copy does not deny a possible committed write after partial/ambiguous add failure',()=>{
 const source=readFileSync(new URL('../src/components/AddItemPicker.tsx',import.meta.url),'utf8');
 assert.match(source,/setSelectedItems\(failures\)/);
 assert.match(source,/Check the ticket before adding them again\./);
 assert.match(source,/再度追加する前に伝票をご確認ください。/);
 assert.doesNotMatch(source,/They have not been added|まだ伝票に追加されていません/);
});
