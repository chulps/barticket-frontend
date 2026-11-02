import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source=readFileSync(new URL('../src/components/TicketSidebar.tsx',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*?;\n/gm,'');
const React={createElement:(type,props,...children)=>typeof type==='function'?type({...props,children}):({type,props:{...props,children}})};
const styled=new Proxy(()=>()=> 'styled',{get:()=>()=> 'styled'});
let reduced=false,direction=1,tabSnapshot=undefined,expired=null,present=true;
globalThis.document={visibilityState:'visible'};
globalThis.window={matchMedia:()=>({matches:true})};
const deps={React,styled,AnimatePresence:'presence',useIsPresent:()=>present,useEffect:()=>{},useRef:value=>({current:value}),motion:{div:'motion.div'},useReducedMotion:()=>reduced,useState:initial=>initial===1?[direction,v=>direction=v]:[initial===null?expired:tabSnapshot,()=>{}],Link:'link',TicketListItem:'row',TabGroup:'tabs',Icon:'icon',useI18n:()=>({t:x=>x,locale:'en'}),resolveVisibleSelection:()=>null};
globalThis.__ticketMotion=deps;
const {default:Sidebar}=await import('data:text/javascript,'+encodeURIComponent(`const {${Object.keys(deps).join(',')}}=globalThis.__ticketMotion;\n`+code));
delete globalThis.__ticketMotion;
const all=node=>!node||typeof node!=='object'?[]:[node,...(node.props?.children??[]).flat(Infinity).flatMap(all)];
const render=(count,extra={})=>Sidebar({activeTab:'open',visibleTickets:Array.from({length:count},(_,i)=>({id:i+1,name:'fixture',created_at:1,created_by:'fixture'})),selectedTicketId:2,lastSelectedTicket:{},ticketsForTab:()=>[],setActiveTab:()=>{},setSelectedTicketId:()=>{},setShowTicketDetails:()=>{},handleCreateTicket:()=>{},getTicketTotal:()=>700,setLastSelectedTicket:()=>{},nightOpen:true,canCreate:true,...extra});

test('restores the original composed outer/inner entrance for every row, not only eight',()=>{
 reduced=false;
 for(const count of [10,50,100]) for(const d of [-1,1]) {
  direction=d;
  const tree=all(render(count)),wrappers=tree.filter(n=>n.type==='motion.div'),rows=tree.filter(n=>n.type==='row');
  assert.equal(wrappers.length,count);assert.equal(rows.length,count);
  wrappers.forEach((node,i)=>{
   assert.equal(node.props.key,`open-${i+1}`);
   assert.deepEqual(node.props.initial,{opacity:0,x:d*24});
   assert.deepEqual(node.props.animate,{opacity:1,x:0});
   assert.deepEqual(node.props.transition,{delay:i*.04,duration:.18});
   assert.deepEqual(rows[i].props.initial,{opacity:0,x:-d*24});
   assert.deepEqual(rows[i].props.animate,{opacity:1,x:0});
   assert.deepEqual(rows[i].props.transition,{delay:i*.04,type:'spring',stiffness:500,damping:32,mass:.7});
   assert.equal(rows[i].props.selected,i===1);assert.equal(typeof rows[i].props.onClick,'function');
  });
 }
});
test('reduced motion bypasses both original layers without delaying ticket access',()=>{
 reduced=true;
 for(const node of all(render(100)).filter(n=>n.type==='motion.div'||n.type==='row')) {
  assert.equal(node.props.initial,false);assert.deepEqual(node.props.animate,{opacity:1,x:0});assert.deepEqual(node.props.transition,{duration:0});
 }
});

test('live arrivals touch only the affected row; quiet snapshots never replay row entrances',()=>{
 reduced=false;direction=1;tabSnapshot=undefined;expired=null;
 const ticketMotion={sequence:2,source:'live',moves:[{id:3,from:'paid',to:'open'},{id:7,from:'open',to:'cancelled'}]};
 let nodes=all(render(10,{ticketMotion}));
 const wrappers=nodes.filter(n=>n.type==='motion.div');
 wrappers.forEach((row,i)=>assert.equal(Boolean(row.props.initial),i===2));
 assert.equal(wrappers[2].props.transition.delay,0);
 assert.equal(wrappers[2].props['data-ticket-arrival'],2);
 assert.deepEqual(wrappers[6].props.variants.exit({leavingIds:[7],direction:1}),{opacity:0,x:-24,transition:{duration:.18}});
 assert.deepEqual(wrappers[5].props.variants.exit({leavingIds:[7],direction:1}),{opacity:1,x:0,transition:{duration:0}});
 for(const source of ['quiet']) {
  nodes=all(render(10,{ticketMotion:{...ticketMotion,source,moves:[]}}));
  nodes.filter(n=>n.type==='motion.div'||n.type==='row').forEach(row=>assert.equal(row.props.initial,false));
 }
 // User tab navigation has its original per-index delay even after a recent move.
 tabSnapshot=ticketMotion;
 nodes=all(render(10,{ticketMotion}));
 nodes.filter(n=>n.type==='motion.div').forEach((row,i)=>{assert.equal(row.props.transition.delay,i*.04);assert.equal(row.props['data-ticket-arrival'],undefined);});
 tabSnapshot=undefined;
 for(const extra of [{detailsOpen:true},{ticketMotion:{...ticketMotion,sequence:3}}]) {
  expired=3;
  all(render(10,{ticketMotion,...extra})).filter(n=>n.type==='motion.div').forEach(row=>assert.equal(row.props.initial,false));
 }
 expired=null;
});
test('exiting rows immediately become inert rather than retaining stale ticket actions',()=>{
 present=false;
 all(render(1)).filter(n=>n.type==='motion.div').forEach(row=>assert.equal(row.props.inert,true));
 present=true;
});
