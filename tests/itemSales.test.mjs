import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/components/itemSales.ts',import.meta.url),'utf8');
const {itemSales,saleShare,servicePeriod,validSalesRange}=await import('data:text/javascript,'+encodeURIComponent(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
const line=(id,name,q,price,extra={})=>({id,menu_item_id:id,type:'menu',name,quantity:q,unit_price:price,subtotal:q*price,...extra});
const ticket=(items,extra={})=>({id:1,status:'paid',items,shiftId:1,...extra});
test('all items retained, denominator includes covers and staff, historical subtotals preserved',()=>{
 const result=itemSales([ticket([line(1,'A',2,100,{subtotal:175}),line(2,'B',1,400),line(3,'C',1,300),line(4,'D',1,200),line(0,'Cover',2,500,{type:'cover'}),line(1,'Staff A',1,100,{staff_drink:true})])]);
 assert.equal(result.items.length,6);assert.equal(result.revenue,2175);assert.equal(result.items.find(x=>x.name==='A').revenue,175);
 assert.deepEqual(result.breakdown.map(x=>x.revenue),[1075,100,1000]);assert.equal(saleShare(1000,2000),50);
});
test('serving sizes and historical prices stay visible beneath same menu identity',()=>{
 const row=itemSales([ticket([line(1,'A',2,100,{price_key:'15ml'}),line(1,'A renamed',1,180,{price_key:'30ml'}),line(1,'A',1,120,{price_key:'15ml'})])]).items[0];
 assert.equal(row.quantity,4);assert.equal(row.revenue,500);assert.equal(row.variants.length,3);
});
test('cancelled, open, refunded, partially paid, written off tickets do not become item revenue',()=>{
 const item=[line(1,'A',1,100)]; const rows=[ticket(item),ticket(item,{status:'cancelled'}),ticket(item,{status:'open'}),ticket(item,{payment:{refunded_at:123}}),ticket(item,{balanceDue:50}),ticket(item,{writtenOffAmount:10}),ticket(item,{settlementStatus:'written_off'})];
 const result=itemSales(rows);assert.equal(result.revenue,100);assert.equal(result.excludedTickets,6);
});
test('zero revenue is safe, invalid line data not fabricated',()=>{
 const result=itemSales([ticket([line(1,'free',1,0),line(2,'invalid',NaN,100),line(3,'negative',1,-100)])]);
 assert.equal(result.items.length,1);assert.equal(result.invalidLines,2);assert.equal(saleShare(0,0),0);assert.deepEqual(itemSales([]).items,[]);
});
test('custom period uses service date, excludes old-ticket collections and flags undated data',()=>{
 const a=ticket([],{serviceBusinessDate:'2026-11-02'}), b=ticket([],{serviceBusinessDate:'2026-10-31'}), c=ticket([],{shiftId:2}), d=ticket([],{shiftId:null});
 const result=servicePeriod([a,b,c,d],'2026-11-01','2026-11-03',new Map([[2,'2026-11-03']]));
 assert.deepEqual(result.rows,[a,c]);assert.equal(result.unknownDates,1);
});
test('large catalogs are complete, name fallback cannot collide with numeric menu identity',()=>{
 const items=Array.from({length:1000},(_,i)=>line(i,`Item ${i}`,1,i));items.push(line(1001,'1',2,10,{menu_item_id:null}));
 const result=itemSales([ticket(items)]);assert.equal(result.items.length,1001);assert.equal(result.revenue,499520);
});
test('component keeps share denominator outside search, paginates rather than truncates and fences async reads',()=>{
 const ui=readFileSync(new URL('../src/components/ItemSalesPanel.tsx',import.meta.url),'utf8');
 assert.match(ui,/saleShare\(row.revenue,data.revenue\)/);assert.match(ui,/slice\(current\*25,current\*25\+25\)/);assert.match(ui,/token !== getToken\(\)/);assert.match(ui,/request !== generation.current/);assert.match(ui,/date_from: start, date_to: end/);
 const page=readFileSync(new URL('../src/pages/Analytics.tsx',import.meta.url),'utf8');assert.match(page,/ticketsReady && reportsReady && !ticketsError && !reportsError/);assert.match(page,/<ItemSalesPanel/);
});

test('cover units exclude returning and waived guests; staff identity never mislabels a grouped drink',()=>{
 const result=itemSales([ticket([line(0,'Cover',4,500,{type:'cover',subtotal:1000}),line(2,'Staff Drink — Alice: Beer',1,700,{staff_drink:true,drink_name:'Beer'}),line(2,'Staff Drink — Bob: Beer',2,700,{staff_drink:true,drink_name:'Beer'})],{guestCount:4,returningGuestCount:1,waivedCoverCount:1})]);
 assert.equal(result.items.find(r=>r.kind==='cover').quantity,2);const staff=result.items.find(r=>r.kind==='staff');assert.equal(staff.name,'Beer');assert.equal(staff.quantity,3);
});
test('null shift with recorded service date is included and custom range limits are explicit',()=>{
 const row=ticket([],{shiftId:null,serviceBusinessDate:'2026-11-17'});assert.deepEqual(servicePeriod([row],'2026-11-17','2026-11-17',new Map()).rows,[row]);
 assert.equal(validSalesRange('2026-01-01','2026-12-31'),true);assert.equal(validSalesRange('2026-01-01','2027-01-02'),false);assert.equal(validSalesRange('',''),false);assert.equal(validSalesRange('2026-11-18','2026-11-17'),false);
});

const apiSource=readFileSync(new URL('../src/api/tickets.ts',import.meta.url),'utf8');
const apiCode=ts.transpileModule(apiSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/^import .*;$/gm,'');
const {toTicket}=await import('data:text/javascript,'+encodeURIComponent(apiCode));
const apiTicket={id:50,name:'Mapped',status:'paid',items:[],guest_count:4,returning_guest_count:1,waived_cover_count:1,cover_charge_per_person:500,cover_charge_total:1000,total:1000,created_at:0,paid_at:100,cancelled_at:null,created_by:'Staff',shift_id:1,payment:null,amount_paid:1000,balance_due:0,service_business_date:'2026-11-17',settlement_status:'settled'};
test('real API mapper retains chargeable cover and excludes audited cancellation/void state',()=>{
 const mapped=toTicket(apiTicket);assert.equal(itemSales([mapped]).items[0].quantity,2);assert.equal(itemSales([mapped]).revenue,1000);
 const cancelled=toTicket({...apiTicket,status:'cancelled',cancelled_at:200});assert.equal(itemSales([cancelled]).revenue,0);
 const voided=toTicket({...apiTicket,status:'open',settlement_status:'outstanding',balance_due:1000,amount_paid:0,payments:[{id:1,amount:1000,type:'card',paid_at:100,voided_at:200}]});assert.equal(itemSales([voided]).revenue,0);
});
test('staff totals use recorded IDs, preserve same-name members, and keep missing attribution separate',()=>{
 const staff=(id,name,quantity)=>line(8,'Staff drink',quantity,500,{staff_drink:true,staff_id:id,staff_name:name,drink_name:'Beer'});
 const result=itemSales([ticket([staff(1,'Alex',2),staff(2,'Alex',1),staff(null,'Alex',1),staff(1,'Alex',1)])]);
 assert.deepEqual(result.staff.map(p=>[p.id,p.quantity,p.revenue]),[['staff:1',3,1500],['staff:2',1,500],['unattributed',1,500]]);
 assert.equal(result.staff.reduce((s,p)=>s+p.revenue,0),result.breakdown.find(r=>r.kind==='staff').revenue);
 assert.equal(result.revenue,2500);
});

test('API mapper retains recorded staff identity',()=>{
 const mapped=toTicket({...apiTicket,items:[line(8,'Staff',1,500,{staff_drink:true,staff_id:77,staff_name:'QA',drink_name:'Beer'})]});
 assert.equal(mapped.items.find(l=>l.staff_drink).staff_id,77);
});
