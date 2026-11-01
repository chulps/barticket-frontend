import {test,expect} from '@playwright/test';
for(const locale of ['en','ja'])for(const width of [320,1280])test(`pay donut gross center and accessible segments ${locale}${width}`,async({page},info)=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('**/donut-fixture',r=>r.fulfill({contentType:'text/html',body:`<html><meta charset="utf-8"><div id="root"></div><script type="module">
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 const {default:Donut}=await import('/src/pages/PayAllocationDonut.tsx');import '/src/index.css';
 const slices=[{id:'remaining',label:'Remaining after recorded costs (provisional)',value:8998,display:'¥8,998',color:'var(--royal-400)'},{id:'wages',label:'Staff wages',value:1000,display:'¥1,000',color:'var(--success-400)'},{id:'bonus',label:'Recorded bonus',value:1,display:'¥1',color:'var(--warning-400)'},{id:'deductions',label:'Recorded deductions',value:1,display:'¥1',color:'var(--danger-400)'},{id:'zero',label:'Recorded zero',value:0,display:'¥0',color:'var(--neutral-400)'}];
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{style:{maxWidth:'500px',padding:'12px'}},[1,2].map(i=>React.createElement(Donut,{key:i,title:'Gross share '+i,slices,center:'¥10,000',locale:'${locale}',note:'Recorded allocation, not final pay.'}))));
 </script></html>`}));
 await page.goto('/donut-fixture');
 const chart=page.getByRole('region',{name:'Gross share 1',exact:true});
 await expect(chart.locator('[data-pay-gross-center]')).toHaveText('¥10,000');
 const ids=await page.locator('mask').evaluateAll(nodes=>nodes.map(n=>n.id));expect(new Set(ids).size).toBe(2);
 await expect(chart.locator('[data-pay-segment]')).toHaveCount(4);
 const wage=chart.locator('[data-pay-segment="wages"]');
 await wage.focus();await expect(chart.getByRole('status')).toHaveText('Staff wages: ¥1,000');
 await wage.press('Escape');await expect(chart.getByRole('status')).not.toContainText('Staff wages:');
 const legend=chart.getByRole('button',{name:'Recorded bonus ¥1',exact:true});
 await legend.click();await expect(chart.getByRole('status')).toHaveText('Recorded bonus: ¥1');
 await expect(chart.locator('[data-pay-gross-center]')).toHaveText('¥10,000');
 // Hover the middle of the first arc, not its SVG bounding box center (the hole).
 await chart.locator('svg').scrollIntoViewIfNeeded();
 const ring=await chart.locator('svg').boundingBox();const angle=(.8998*Math.PI)-Math.PI/2;
 await page.mouse.move(ring.x+ring.width/2+Math.cos(angle)*ring.width*42/120,ring.y+ring.height/2+Math.sin(angle)*ring.height*42/120);
 await expect(chart.getByRole('status')).toHaveText('Remaining after recorded costs (provisional): ¥8,998');
 await page.mouse.move(0,0);await expect(chart.getByRole('status')).not.toContainText('Remaining after recorded costs (provisional):');
 const labelBounds=await chart.locator('li button').evaluateAll(buttons=>buttons.map(button=>({label:button.querySelector('span').getBoundingClientRect().right,amount:button.querySelector('b').getBoundingClientRect().left})));
 expect(labelBounds.every(box=>box.label<=box.amount)).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('pay-breakdown.png'),fullPage:true});
});
