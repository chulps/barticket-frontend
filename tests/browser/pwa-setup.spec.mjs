import {test,expect} from '@playwright/test';
for (const locale of ['en','ja']) test(`existing iPhone setup guidance ${locale}`,async({browser},testInfo)=>{
  const context=await browser.newContext({baseURL:testInfo.project.use.baseURL,viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
  const page=await context.newPage();
  await page.addInitScript(locale=>{localStorage.setItem('barticket_locale',locale);localStorage.setItem('barticket_token','TEST_ONLY');delete window.PushManager;},locale);
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('http://127.0.0.1:8765/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    expect(['GET','OPTIONS']).toContain(request.method());
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,OPTIONS'}});
    let body={};
    if(path==='/auth/status')body={has_accounts:true};
    else if(path==='/auth/me')body={id:7,name:'Preview',email:'preview@example.invalid',role:'manager',has_password:true};
    else if(path==='/shifts/current')body=null;
    else if(path==='/menu')body={items:[]};
    else if(path==='/notices')body={notices:[]};
    else if(path==='/tickets')body=[];
    await route.fulfill({status:200,json:body,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,OPTIONS'}});
  });
  await page.goto('/notifications');
  await expect(page.getByRole('heading',{name:locale==='ja'?'iPhoneで通知を使う準備':'Set up notifications on iPhone or iPad',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:locale==='ja'?'この端末で通知を有効にする':'Enable notifications',exact:true})).toBeDisabled();
  await page.screenshot({path:testInfo.outputPath(`barticket-existing-iphone-setup-${locale}.png`),fullPage:true});
  await context.close();
});
