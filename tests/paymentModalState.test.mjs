import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
let id=0;
async function load(file,deps={}){
 let code=ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText.replace(/^import .*?;\n/gm,'');
 const key='__paymentState'+id++;globalThis[key]=deps;
 const result=await import('data:text/javascript,'+encodeURIComponent(`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+code));delete globalThis[key];return result;
}
const recovery=await load('components/paymentAttemptRecovery.ts');
class ApiError extends Error{constructor(status){super('fixture');this.status=status;}}
const React={createElement:(type,props,...children)=>({type,props:{...props,children}})};
const styled=new Proxy({}, {get:()=>()=> 'styled'});
function runtime(){
 let cursor=0;const slots=[];let guard;
 return {reset:()=>{cursor=0;},guard:()=>guard,
 deps:{React,styled,...recovery,ApiError,Icon:'icon',businessDateJst:()=> '2026-10-31',isPreviousServiceDate:()=>false,validCollectionConfirmation:()=>true,nextSelectorIndex:()=>null,
 useI18n:()=>({t:x=>x,locale:'en'}),useModal:()=>({closeModal:()=>{},registerCloseGuard:value=>guard=value}),
 useEffect:(fn,deps)=>{const index=cursor++;const previous=slots[index];if(!previous||!deps||deps.some((value,i)=>value!==previous.deps?.[i])){previous?.cleanup?.();slots[index]={deps,cleanup:fn()};}},useRef:initial=>{const index=cursor++;return slots[index]??=( {current:initial});},
 useState:initial=>{const index=cursor++;if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;return [slots[index],value=>slots[index]=typeof value==='function'?value(slots[index]):value];}}};
}
const all=node=>!node||typeof node!=='object'?[]:[node,...(node.props?.children??[]).flat(Infinity).flatMap(all)];
async function modal(confirm){
 recovery.paymentAttemptRecovery.clear();const r=runtime();const {default:PaymentModal}=await load('components/PaymentModal.tsx',r.deps);
 const props={ticket:{id:11,items:[],serverTotal:700,balanceDue:700,serviceStatus:'completed',deferredAt:1,created_at:1},onConfirm:confirm};
 const render=()=>{r.reset();return PaymentModal(props);};
 const send=()=>{const tree=render();return all(tree).filter(n=>n.type==='button').at(-1).props.onClick();};
 return {...r,render,send,confirm:()=>all(render()).filter(n=>n.type==='button').at(-1),error:()=>all(render()).find(n=>n.props?.role==='alert')};
}
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
test('pending blocks every guarded close and duplicate click; success releases attempt',async()=>{
 let resolve,calls=0;const pending=new Promise(r=>resolve=r);
 const m=await modal(()=>{calls++;return pending;});m.send();m.send();assert.equal(calls,1);assert.equal(m.guard()(),false);
 resolve({id:11,balanceDue:400});await settle();assert.equal(m.guard()(),true);assert.equal(recovery.paymentAttemptRecovery.get(11),undefined);
 assert.ok(all(m.render()).some(n=>n.props?.children?.includes('Payment recorded')));
});
test('first explicit validation rejection releases intent and enables correction',async()=>{
 const m=await modal(async()=>{throw new ApiError(400);});m.send();await settle();
 assert.equal(recovery.paymentAttemptRecovery.get(11),undefined);assert.equal(m.guard()(),true);
 assert.ok(m.error().props.children.join('').includes('Payment was not recorded'));
 assert.equal(all(m.render()).find(n=>n.type==='input').props.disabled,false);
});
test('an error after ambiguous transport must not release immutable payment intent',async()=>{
 let calls=0;const m=await modal(async()=>{throw ++calls===1?new Error('lost response'):new ApiError(400);});
 m.send();await settle();const first=recovery.paymentAttemptRecovery.get(11);assert.ok(first);
 m.send();await settle();assert.equal(recovery.paymentAttemptRecovery.get(11),first);
 assert.ok(m.error().props.children.join('').includes('unconfirmed'));
 assert.equal(all(m.render()).find(n=>n.type==='input').props.disabled,true);
});

test('ordinary modal replacement respects pending/dirty guard, but force and auth teardown bypass it',async()=>{
 const previousWindow=globalThis.window;globalThis.window=new EventTarget();
 try {
  const r=runtime();const {ModalProvider}=await load('context/ModalProvider.tsx',{...r.deps,ModalContext:{Provider:'provider'},useCallback:fn=>fn});
  const value=()=>{r.reset();return ModalProvider({children:null}).props.value;};
  value().openModal({title:'A'});assert.equal(value().modal.title,'A');
  value().registerCloseGuard(()=>false);value().openModal({title:'B'});assert.equal(value().modal.title,'A');
  value().closeModal();assert.equal(value().modal.title,'A');
  value().registerCloseGuard(()=>true);value().openModal({title:'B'});assert.equal(value().modal.title,'B');
  value().registerCloseGuard(()=>false);value().forceCloseModal();assert.equal(value().modal,null);
  value().openModal({title:'C'});value().registerCloseGuard(()=>false);
  window.dispatchEvent(new Event('barticket-auth'));assert.equal(value().modal,null);
 } finally {globalThis.window=previousWindow;}
});


test('missing server balance never claims fully settled; wrong ticket response stays unconfirmed',async()=>{
 const unknown=await modal(async()=>({id:11}));unknown.send();await settle();
 assert.ok(all(unknown.render()).some(n=>n.props?.children?.some(c=>typeof c==='string'&&c.includes('Balance unavailable'))));
 assert.equal(all(unknown.render()).some(n=>n.props?.children?.includes('Fully settled')),false);
 const wrong=await modal(async()=>({id:12,balanceDue:0}));wrong.send();await settle();
 assert.ok(wrong.error().props.children.join('').includes('unconfirmed'));assert.ok(recovery.paymentAttemptRecovery.get(11));
});
