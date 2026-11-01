import {test,expect} from '@playwright/test';

// Every network request is isolated from production. Native notification APIs
// are replaced before app startup, so these tests cannot change permissions or
// real browser subscriptions.
async function fixture(page,{locale='en',permission='granted',subscribed=true,owned=true,permissionResult='granted',failEnable=false,failDisable=false,unsupported=false,holdEnable,holdStatus}={}) {
  const writes=[];
  await page.addInitScript(options=>{
    localStorage.setItem('barticket_locale',options.locale);
    localStorage.setItem('barticket_token','TEST_ONLY');
    const state={permission:options.permission,subscribed:options.subscribed,permissionRequests:0,subscribeCalls:0,unsubscribeCalls:0};
    window.__pushFixture=state;
    const subscription={endpoint:'https://push.example.invalid/test-device',toJSON:()=>({endpoint:'https://push.example.invalid/test-device',keys:{p256dh:'fixture',auth:'fixture'}}),unsubscribe:async()=>{state.unsubscribeCalls++;state.subscribed=false;return true;}};
    const registration={pushManager:{getSubscription:async()=>state.subscribed?subscription:null,subscribe:async()=>{state.subscribeCalls++;state.subscribed=true;return subscription;}}};
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>registration,getRegistration:async()=>registration,addEventListener(){},removeEventListener(){}}});
    Object.defineProperty(window,'Notification',{configurable:true,value:{get permission(){return state.permission},requestPermission:async()=>{state.permissionRequests++;state.permission=options.permissionResult;return state.permission;}}});
    if(options.unsupported){
      delete window.PushManager;
      Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
    }else Object.defineProperty(window,'PushManager',{configurable:true,value:function PushManager(){}});
  },{locale,permission,subscribed,permissionResult,unsupported});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('http://127.0.0.1:8765/**',async route=>{
    const request=route.request(),path=new URL(request.url()).pathname;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS'};
    if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
    let status=200,body={};
    if(path==='/auth/status')body={has_accounts:true};
    else if(path==='/auth/me')body={id:7,name:'Preview',email:'preview@example.invalid',role:'manager',has_password:true};
    else if(path==='/shifts/current')body=null;
    else if(path==='/menu')body={items:[]};
    else if(path==='/notices')body={notices:[]};
    else if(path==='/tickets')body=[];
    else if(path==='/push/preferences')body={preferences:Object.fromEntries('ticket_created ticket_updated ticket_payment_recorded ticket_payment_deferred ticket_balance_written_off ticket_payment_corrected ticket_closed stock staff_drink shift_opened shift_closed shift_kept_open punch_corrected clock_in clock_out noon_clock_out'.split(' ').map(key=>[key,true]))};
    else if(path==='/push/vapid-public-key')body={public_key:'dGVzdA'};
    else if(path==='/push/subscriptions/status'){
      expect(request.method()).toBe('POST');
      expect(['Bearer TEST_ONLY','Bearer TEST_ONLY_2']).toContain(request.headers().authorization);
      if(holdStatus && request.headers().authorization==='Bearer TEST_ONLY')await holdStatus;
      body={enabled:request.headers().authorization==='Bearer TEST_ONLY_2'?false:owned};
    }else if(path==='/push/subscriptions'){
      expect(request.headers().authorization).toBe('Bearer TEST_ONLY');
      writes.push({method:request.method(),body:request.postDataJSON()});
      if(request.method()==='POST'){
        if(holdEnable)await holdEnable;
        if(failEnable){status=500;body={detail:'Fixture subscription failure'};}else owned=true;
      }else if(request.method()==='DELETE'){
        if(failDisable){status=500;body={detail:'Fixture cleanup failure'};}else owned=false;
      }else throw new Error(`Unexpected push method ${request.method()}`);
    }else if(request.method()!=='GET')throw new Error(`Unexpected mutation ${request.method()} ${path}`);
    await route.fulfill({status,json:body,headers});
  });
  await page.goto('/notifications');
  const control=page.getByRole('switch',{name:locale==='ja'?'端末のプッシュ通知':'Device push notifications',exact:true});
  await expect(control).toBeVisible();
  return {control,writes,state:()=>page.evaluate(()=>window.__pushFixture)};
}

for(const locale of ['en','ja'])test(`owned device notification switch turns off with scoped cleanup ${locale}`,async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const f=await fixture(page,{locale});
  await expect(f.control).toHaveAttribute('aria-checked','true');
  await expect(f.control).toBeEnabled();
  await expect(f.control).toContainText(locale==='ja'?'オン':'On');
  const colors=await f.control.evaluate(el=>({track:getComputedStyle(el.querySelector('[data-checked]')).backgroundColor,dot:getComputedStyle(el.closest('section').querySelector('[role="status"] > span')).backgroundColor}));
  expect(colors).toEqual({track:'rgb(30, 202, 107)',dot:'rgb(30, 202, 107)'});
  await page.screenshot({path:testInfo.outputPath(`notification-toggle-enabled-${locale}.png`),fullPage:true});
  await f.control.focus();
  await page.keyboard.press('Space');
  await expect(f.control).toHaveAttribute('aria-checked','false');
  await expect(f.control).toBeEnabled();
  expect(f.writes).toEqual([{method:'DELETE',body:{endpoint:'https://push.example.invalid/test-device'}}]);
  expect(await f.state()).toMatchObject({permission:'granted',permissionRequests:0,unsubscribeCalls:1,subscribed:false});
});

test('another account browser subscription does not make the switch checked',async({page})=>{
  const f=await fixture(page,{owned:false});
  await expect(f.control).toBeEnabled();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  expect(f.writes).toEqual([]);
  expect(await f.state()).toMatchObject({permissionRequests:0,unsubscribeCalls:0});
});

test('enable stays off and busy until server confirmation, without duplicate requests',async({page})=>{
  let release;
  const holdEnable=new Promise(resolve=>release=resolve);
  const f=await fixture(page,{subscribed:false,owned:false,permission:'default',holdEnable});
  await expect(f.control).toBeEnabled();
  expect((await f.state()).permissionRequests).toBe(0);
  await f.control.click();
  await expect.poll(()=>f.writes.length).toBe(1);
  await expect(f.control).toBeDisabled();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  release();
  await expect(f.control).toHaveAttribute('aria-checked','true');
  await expect(f.control).toBeEnabled();
  expect(f.writes.map(w=>w.method)).toEqual(['POST']);
  expect(await f.state()).toMatchObject({permissionRequests:1,subscribeCalls:1,subscribed:true});
});

test('failed subscription persistence rolls back local subscription and remains off',async({page})=>{
  const f=await fixture(page,{subscribed:false,owned:false,failEnable:true});
  await expect(f.control).toBeEnabled();
  await f.control.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  expect(await f.state()).toMatchObject({subscribeCalls:1,unsubscribeCalls:1,subscribed:false});
  expect(f.writes.map(w=>w.method)).toEqual(['POST']);
});

test('blocked permission is off with guidance and never requests permission',async({page})=>{
  const f=await fixture(page,{permission:'denied',subscribed:false,owned:false});
  await expect(f.control).toBeDisabled();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  await expect(page.getByRole('region',{name:'Push notification settings',exact:true}).getByRole('status')).toContainText(/blocked|settings/i);
  expect((await f.state()).permissionRequests).toBe(0);
  expect(f.writes).toEqual([]);
});

test('dismissed permission prompt never persists a subscription or claims enabled',async({page})=>{
  const f=await fixture(page,{permission:'default',permissionResult:'default',subscribed:false,owned:false});
  await expect(f.control).toBeEnabled();
  await f.control.click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  expect(await f.state()).toMatchObject({permissionRequests:1,subscribeCalls:0,subscribed:false});
  expect(f.writes).toEqual([]);
});

for(const locale of ['en','ja'])test(`iPhone browser keeps installation guidance with unavailable toggle ${locale}`,async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const f=await fixture(page,{locale,unsupported:true,subscribed:false,owned:false});
  await expect(f.control).toBeDisabled();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  const guideHeading=page.getByRole('heading',{name:locale==='ja'?'iPhoneで通知を使う準備':'Set up notifications on iPhone or iPad',exact:true});
  await expect(guideHeading).toBeVisible();
  const guideStyle=await guideHeading.evaluate(el=>{const style=getComputedStyle(el.parentElement);return {background:style.backgroundColor,borders:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth]};});
  expect(guideStyle).toEqual({background:'rgba(0, 0, 0, 0)',borders:['0px','0px','0px','0px']});
  expect((await f.state()).permissionRequests).toBe(0);
  expect(f.writes).toEqual([]);
  await page.screenshot({path:testInfo.outputPath(`notification-toggle-iphone-setup-${locale}.png`),fullPage:true});
});

test('failed off cleanup is visibly reported rather than silently successful',async({page})=>{
  const f=await fixture(page,{failDisable:true});
  await expect(f.control).toHaveAttribute('aria-checked','true');
  await f.control.click();
  await expect(page.getByRole('alert')).toBeVisible();
  // Browser unsubscription has happened, so a later read may truthfully show
  // off; the failed server cleanup must remain visible to the user.
  expect(f.writes.map(w=>w.method)).toEqual(['DELETE']);
  expect(await f.state()).toMatchObject({permission:'granted',permissionRequests:0,unsubscribeCalls:1,subscribed:false});
});


test('Check again recovers after the user allows notifications in device settings',async({page})=>{
  const f=await fixture(page,{permission:'denied',subscribed:false,owned:false});
  await expect(f.control).toBeDisabled();
  // Only the fixture permission changes; no browser permission is requested.
  await page.evaluate(()=>{window.__pushFixture.permission='granted';});
  await page.getByRole('button',{name:'Check again',exact:true}).click();
  await expect(f.control).toBeEnabled();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  await expect(page.getByRole('region',{name:'Push notification settings',exact:true}).getByRole('status')).toContainText('Push is ready');
  expect((await f.state()).permissionRequests).toBe(0);
  expect(f.writes).toEqual([]);
});

test('late ownership check cannot turn on the switch after an account change',async({page})=>{
  let release;
  const holdStatus=new Promise(resolve=>release=resolve);
  const f=await fixture(page,{holdStatus});
  await expect(f.control).toBeDisabled();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  await f.control.evaluate(el=>{
    window.__checkedHistory=[];
    new MutationObserver(()=>window.__checkedHistory.push(el.getAttribute('aria-checked'))).observe(el,{attributes:true,attributeFilter:['aria-checked']});
    localStorage.setItem('barticket_token','TEST_ONLY_2');
    window.dispatchEvent(new Event('barticket-auth'));
  });
  release();
  await expect(f.control).toBeEnabled();
  await expect(f.control).toHaveAttribute('aria-checked','false');
  expect(await page.evaluate(()=>window.__checkedHistory)).not.toContain('true');
  expect((await f.state()).permissionRequests).toBe(0);
  expect(f.writes).toEqual([]);
});
