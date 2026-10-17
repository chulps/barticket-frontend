import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const picker=readFileSync(new URL("../src/components/AddItemPicker.tsx",import.meta.url),"utf8");
test("picker results reserve scroll range behind selected-item sticky footer",()=>{
 assert.match(picker,/scroll-padding-bottom: calc\(112px \+ env\(safe-area-inset-bottom, 0px\)\)/);
 assert.match(picker,/padding-bottom: calc\(112px \+ env\(safe-area-inset-bottom, 0px\)\)/);
 assert.match(picker,/overscroll-behavior: contain/);
 assert.match(picker,/box-sizing: border-box/);
});
