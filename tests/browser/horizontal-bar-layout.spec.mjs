import {test,expect} from "@playwright/test";
for(const locale of ["en","ja"])for(const width of [320,1280])test("horizontal chart keeps full labels and amounts visible "+locale+width,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 const title=locale==="ja"?"給与の比較":"Pay comparison";
 const longLabel=locale==="ja"?"給与確認対象となるとても長いスタッフの名前":"A very long staff name for the pay comparison";
 const bars=[{id:"date",label:"2026-10-01",value:123456789,display:"¥123,456,789"},{id:"person",label:longLabel,value:246913578,display:"¥246,913,578"},{id:"zero",label:"Zero",value:0,display:"¥0"}];
 await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
 await page.route("**/chart-layout-fixture",route=>route.fulfill({contentType:"text/html",body:`<html><meta charset="utf-8"><div id="root"></div><script type="module">
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 const {HorizontalBarChart}=await import('/src/components/AnalyticsCharts.tsx');import '/src/index.css';
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{style:{width:'${width===320?210:700}px',margin:'20px'}},React.createElement(HorizontalBarChart,{title:${JSON.stringify(title)},locale:${JSON.stringify(locale)},bars:${JSON.stringify(bars)}})));
 </script></html>`}));
 await page.goto("/chart-layout-fixture");
 const chart=page.getByRole("region",{name:title,exact:true});
 await expect(chart).toBeVisible();
 if(width===320){
  await expect(chart.locator("ul > li")).toHaveCount(3);
  const bounds=await chart.boundingBox();
  for(const text of [longLabel,"¥123,456,789","¥246,913,578","¥0"]){const item=chart.getByText(text,{exact:true});await expect(item).toBeVisible();const box=await item.boundingBox();expect(box.x).toBeGreaterThanOrEqual(bounds.x);expect(box.x+box.width).toBeLessThanOrEqual(bounds.x+bounds.width);}
  const values=await chart.locator('li > div[aria-hidden="true"] > div').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width));
  expect(values[1]/values[0]).toBeCloseTo(2,1);expect(values[2]).toBe(0);
 }else{await expect(chart.locator("svg")).toBeVisible();await expect(chart.locator("ul")).toHaveCount(0);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath("chart.png"),fullPage:true});
});

for(const locale of ["en","ja"])for(const width of [320,1280])test("shared horizontal rows wrap long labels without reversing signed bars "+locale+width,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 const label=locale==="ja"?"長い曜日別比較":"Long comparison labels";
 const long=locale==="ja"?"とても長い比較対象ラベルを省略せず表示":"An unusually long comparison label without truncation";
 const bars=[{id:"negative",label:long,value:-100,display:locale==="ja"?"-￥100 · 123456シフト":"-¥100 · 123456 shifts"},{id:"positive",label:"Positive",value:200,display:"¥200 · 2 shifts"},{id:"zero",label:"Zero",value:0,display:"¥0 · 1 shift"}];
 await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
 await page.route("**/horizontal-rows-fixture",route=>route.fulfill({contentType:"text/html",body:`<html><meta charset="utf-8"><div id="root"></div><script type="module">
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 const {HorizontalBarRows}=await import('/src/components/AnalyticsCharts.tsx');import '/src/index.css';
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{style:{maxWidth:'700px',margin:'20px'}},React.createElement(HorizontalBarRows,{label:${JSON.stringify(label)},bars:${JSON.stringify(bars)}})));
 </script></html>`}));
 await page.goto("/horizontal-rows-fixture");
 const list=page.getByRole("list",{name:label});
 await expect(list.getByText(long,{exact:true})).toBeVisible();
 const geometry=await list.locator("li").evaluateAll(nodes=>nodes.map(node=>{
  const track=node.querySelector('[aria-hidden="true"]').getBoundingClientRect(),bar=node.querySelector("b").getBoundingClientRect(),zero=node.querySelector("i").getBoundingClientRect(),label=node.querySelector("[data-chart-label]").getBoundingClientRect(),value=node.querySelector("[data-chart-value]").getBoundingClientRect();
  return {left:bar.left,right:bar.right,width:bar.width,zero:zero.x,trackWidth:track.width,labelRight:label.right,trackLeft:track.left,trackRight:track.right,valueLeft:value.left,valueRight:value.right};
 }));
 for(const row of geometry){expect(row.labelRight).toBeLessThanOrEqual(row.trackLeft);expect(row.trackRight).toBeLessThanOrEqual(row.valueLeft);expect(row.valueRight).toBeLessThanOrEqual(width);expect(row.trackWidth).toBeGreaterThan(24);}
 expect(geometry[0].left).toBeLessThan(geometry[0].zero);
 expect(Math.abs(geometry[0].right-geometry[0].zero)).toBeLessThan(1);
 expect(Math.abs(geometry[1].left-geometry[1].zero)).toBeLessThan(1);
 expect(geometry[1].width/geometry[0].width).toBeCloseTo(2,1);
 expect(geometry[2].width).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath("pay.png"),fullPage:true});
});
