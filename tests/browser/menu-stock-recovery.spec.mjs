import {test,expect} from '@playwright/test';
for(const locale of ['en','ja']) for(const width of [320,768]) test(`stock failure remains actionable without replay ${locale} ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 await page.clock.install();
 await page.addInitScript(locale=>{localStorage.setItem('barticket_token','ISOLATED_STOCK_TEST');localStorage.setItem('barticket_locale',locale);},locale);
 const item={id:1,name:'Fixture whisky',category:'Whisky',prices:{standard:800},inStock:true};
 let writes=0,reads=0;
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.route('http://127.0.0.1:8765/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PUT,OPTIONS'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  let status=200,data={};
  if(path==='/menu/items/1/stock'){writes++;status=503;data={detail:'Fixture uncertain outcome'};}
  else if(path==='/menu'){reads++;data={items:[item]};}
  else if(path==='/auth/me')data={id:7,name:'Fixture staff',email:'fixture@example.invalid',role:'staff'};
  else if(path==='/shifts/current')data=null;
  else if(path==='/notices')data={notices:[]};
  else if(path==='/realtime/events')data={events:[],cursor:0};
  else if(path==='/auth/status')data={has_accounts:true};
  else {status=404;data={detail:'Fixture endpoint unavailable'};}
  await route.fulfill({status,json:data,headers});
 });
 await page.goto('/menu');
 const ja=locale==='ja';
 await page.getByRole('button',{name:ja?'Fixture whisky の操作':'Actions for Fixture whisky',exact:true}).click();
 await page.getByText(ja?'品切れにする':'Mark out of stock',{exact:true}).click();
 const warning=page.getByRole('alert').filter({hasText:ja?'在庫の更新を確認できませんでした。メニューを再読み込み':'Could not confirm the stock update'});
 await expect(warning).toBeVisible();await expect(warning).toContainText('Fixture whisky');
 await page.clock.fastForward(8000);
 await expect(warning).toBeVisible();expect(writes).toBe(1);
 const before=reads;
 await warning.getByRole('button',{name:ja?'メニューを再読み込み':'Refresh menu',exact:true}).click();
 await expect.poll(()=>reads).toBeGreaterThan(before);
 await expect(warning).toBeVisible();expect(writes).toBe(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('stock-recovery.png'),fullPage:true});
 await warning.getByRole('button',{name:ja?'閉じる':'Dismiss',exact:true}).click();
 await expect(warning).toHaveCount(0);expect(writes).toBe(1);
});
