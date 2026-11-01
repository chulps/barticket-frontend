import { test, expect } from '@playwright/test';
const keys=['ticket_created','ticket_updated','ticket_payment_recorded','ticket_payment_deferred','ticket_balance_written_off','ticket_payment_corrected','ticket_closed','stock','staff_drink','shift_opened','shift_closed','shift_kept_open','punch_corrected','clock_in','clock_out','noon_clock_out'];
async function fixture(page, locale='en') {
  let prefs=Object.fromEntries(keys.map(k=>[k,true]));const writes=[];
  await page.addInitScript(locale=>{localStorage.setItem('barticket_token','TEST_ONLY');localStorage.setItem('barticket_locale',locale);},locale);
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.route('http://127.0.0.1:8765/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,PATCH,POST,OPTIONS'};
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
    let body={},status=200;
    if(path==='/auth/me')body={id:7,name:'Fixture',role:'manager'};
    else if(path==='/menu')body={items:[]};
    else if(path==='/shifts/current')body=null;
    else if(path==='/notices')body={notices:[]};
    else if(path==='/tickets')body=[];
    else if(path==='/tickets/42')body={id:42,name:'Fixture ticket',status:'open',items:[],guest_count:0,total:0};
    else if(path==='/push/preferences') {
      if(req.method()==='PATCH'){writes.push(req.postDataJSON());prefs={...prefs,...req.postDataJSON().preferences};}
      body={preferences:prefs};
    } else if(path.startsWith('/push/')){status=503;body={detail:'Fixture push disabled'};}
    await route.fulfill({status,json:body,headers});
  });
  return writes;
}
for(const width of [320,1280])test(`notification preferences accessible at ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});const writes=await fixture(page);await page.goto('/notifications');await page.getByRole('button',{name:'Notification settings',exact:true}).click();
  const toggle=page.getByRole('switch',{name:'New tickets',exact:true});await expect(toggle).toHaveAttribute('aria-checked','true');
  const onThumb=await toggle.locator('span').boundingBox(), onTrack=await toggle.boundingBox();
  expect(onThumb.x+onThumb.width).toBeLessThanOrEqual(onTrack.x+onTrack.width);
  await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false');
  const offThumb=await toggle.locator('span').boundingBox(), offTrack=await toggle.boundingBox();
  expect(offThumb.x).toBeLessThan(offTrack.x+10);
  expect(writes).toEqual([{preferences:{ticket_created:false}}]);
  await expect(page.getByRole('switch',{name:'Use sounds on this device'})).toHaveAttribute('aria-checked','false');
  await page.getByRole('button',{name:'Preview cha-ching'}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('switch',{name:'Use sounds on this device'})).toHaveAttribute('aria-checked','false');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('preferences.png'),fullPage:true});
});
test('failed preference save does not claim changed state and reload reconciles',async({page})=>{
  await fixture(page);await page.goto('/notifications');await page.getByRole('button',{name:'Notification settings',exact:true}).click();const toggle=page.getByRole('switch',{name:'New tickets',exact:true});await expect(toggle).toBeVisible();
  await page.route('http://127.0.0.1:8765/push/preferences',route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{detail:'offline'},headers:{'Access-Control-Allow-Origin':'*'}}):route.fallback());
  await toggle.click();await expect(page.getByRole('alert')).toContainText('Couldn’t confirm the save');await expect(toggle).toHaveCount(0);
  await page.getByRole('button',{name:'Reload settings'}).click();await expect(toggle).toHaveAttribute('aria-checked','true');
});

test('phone settings share one keyboard dialog and restore the feed on close',async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:900}); await fixture(page); await page.goto('/notifications');
  await expect(page.getByRole('heading',{name:'Device push notifications',exact:true})).toBeHidden();
  await expect(page.getByRole('heading',{name:'Push notification types',exact:true})).toBeHidden();
  await expect(page.getByRole('heading',{name:'Sounds while BarTicket is open',exact:true})).toBeHidden();
  await expect(page.getByRole('heading',{name:'Current shift activity',exact:true})).toBeVisible();
  const options=page.getByRole('button',{name:'Notification settings',exact:true}), toggle=page.getByRole('switch',{name:'New tickets',exact:true});
  await expect(options).toHaveAttribute('aria-expanded','false'); await expect(toggle).toBeHidden();
  const buttonBox=await options.boundingBox(),iconBox=await options.locator('svg').boundingBox();
  expect(buttonBox.width).toBe(44);expect(iconBox.width).toBe(24);expect(iconBox.x).toBeGreaterThanOrEqual(buttonBox.x);expect(iconBox.x+iconBox.width).toBeLessThanOrEqual(320);
  await expect(options.locator('svg')).toBeVisible();
  await expect(page.locator('[aria-labelledby="push-type-ticket_created"]')).toHaveAttribute('aria-checked','true');
  const reads=[];page.on('request',req=>{if(req.method()==='GET' && /\/push\//.test(req.url()))reads.push(req.url());});
  await options.focus(); await page.keyboard.press('Enter'); await expect(toggle).toBeVisible();
  await expect(page.getByRole('button',{name:'Notification type settings',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Sounds while BarTicket is open',exact:true})).toBeVisible();
  await toggle.hover();
  expect(await toggle.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await toggle.evaluate(el=>getComputedStyle(el,'::before').backgroundColor)).toBe('rgb(30, 202, 107)');
  await toggle.focus(); await page.keyboard.press('Escape'); await expect(toggle).toBeHidden(); await expect(options).toBeFocused();
  await options.click(); await page.getByRole('button',{name:'Close notification settings',exact:true}).click();
  await expect(toggle).toBeHidden(); expect(reads).toEqual([]); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('heading',{name:'Current shift activity',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('preferences.png'),fullPage:true});
});
test('each preview schedules audio without push; interruption exposes resume and keeps preference',async({page})=>{
  await fixture(page);
  await page.addInitScript(()=>{
    window.audioStarts=0;
    window.AudioContext=class {
      state='suspended'; currentTime=0; destination={}; onstatechange=null;
      constructor(){window.testAudio=this;}
      async resume(){this.state='running';this.onstatechange?.();}
      async suspend(){this.state='suspended';this.onstatechange?.();}
      createOscillator(){return {frequency:{value:0},connect(){},start(){window.audioStarts++},stop(){},disconnect(){}};}
      createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
    };
  });
  await page.goto('/notifications');
  await page.getByRole('button',{name:'Notification settings',exact:true}).click();
  for(const name of ['Preview new ticket','Preview stockout','Preview cha-ching'])await page.getByRole('button',{name,exact:true}).click();
  expect(await page.evaluate(()=>window.audioStarts)).toBe(7);
  const toggle=page.getByRole('switch',{name:'Use sounds on this device'}); await expect(toggle).toHaveAttribute('aria-checked','false');
  await toggle.click(); await expect(toggle).toHaveAttribute('aria-checked','true');
  await page.evaluate(()=>{window.testAudio.state='interrupted';window.testAudio.onstatechange();});
  await expect(page.getByRole('button',{name:'Resume sounds',exact:true})).toBeVisible(); await expect(toggle).toHaveAttribute('aria-checked','true');
  await page.evaluate(()=>{window.testAudio.state='running';window.testAudio.onstatechange();});
  await expect(page.getByRole('button',{name:'Resume sounds',exact:true})).toBeVisible(); expect(await page.evaluate(()=>window.audioStarts)).toBe(7);
});

for(const locale of ['en','ja'])for(const size of [{width:320,height:640},{width:390,height:700},{width:430,height:700},{width:736,height:360}])test(`phone settings fill viewport with pinned close ${locale} ${size.width}x${size.height}`,async({page},testInfo)=>{
  await page.setViewportSize(size);const writes=await fixture(page,locale);await page.goto('/notifications');
  const name=locale==='ja'?'通知設定':'Notification settings';
  const closeName=locale==='ja'?'通知設定を閉じる':'Close notification settings';
  await page.getByRole('button',{name,exact:true}).click();
  const dialog=page.getByRole('dialog',{name,exact:true});await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el=>el.matches(':modal'))).toBe(true);
  const box=await dialog.boundingBox();expect(box.x).toBe(0);expect(box.y).toBe(0);expect(box.width).toBe(size.width);expect(box.height).toBe(size.height);
  await expect(dialog.getByRole('switch')).toHaveCount(keys.length + 2);
  const scroller=dialog.locator('> div').last();
  await scroller.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  const close=dialog.getByRole('button',{name:closeName,exact:true});
  const closeBox=await close.boundingBox();expect(closeBox.y).toBeGreaterThanOrEqual(0);expect(closeBox.y+closeBox.height).toBeLessThan(100);expect(closeBox.width).toBe(44);
  const preview=dialog.getByRole('button',{name:locale==='ja'?'支払完了の音':'Preview cha-ching',exact:true});
  await preview.scrollIntoViewIfNeeded();await expect(preview).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('audit-phone-settings.png')});
  await close.click();await expect(dialog).toBeHidden();
  await expect(page.getByRole('button',{name,exact:true})).toBeFocused();
  expect(writes).toEqual([]);
});

test('phone Back/Forward and repeated Escape close only settings, keeping linked ticket params',async({page})=>{
  await page.setViewportSize({width:390,height:700});await fixture(page);await page.goto('/notifications?ticket=42');
  const options=page.getByRole('button',{name:'Notification settings',exact:true});
  await options.click();await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page).toHaveURL(/ticket=42&notificationSettings=1/);
  await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/notifications\?ticket=42$/);
  await page.goForward();await expect(page.getByRole('dialog')).toBeVisible();
  await page.evaluate(()=>{for(let i=0;i<3;i++)document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});
  await expect(page).toHaveURL(/notifications\?ticket=42$/);await expect(options).toBeFocused();
});

test('direct settings URL closes in place and desktop outside navigation is not undone',async({page})=>{
  await page.setViewportSize({width:390,height:700});await fixture(page);await page.goto('/notifications?notificationSettings=1&ticket=42');
  await page.getByRole('button',{name:'Close notification settings',exact:true}).click();
  await expect(page).toHaveURL(/notifications\?ticket=42$/);
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'Notification settings',exact:true}).click();
  const panel=page.locator('#notification-settings-panel');await expect(panel).toBeVisible();expect(await panel.evaluate(el=>el.matches(':modal'))).toBe(false);
  await page.getByRole('link',{name:'Tickets',exact:true}).click();
  await expect(page).toHaveURL(/tickets/);await expect(panel).toHaveCount(0);
});

test('phone focus, feed scroll and desktop resize preserve the same settings subtree',async({page})=>{
  await page.setViewportSize({width:390,height:700});await fixture(page);await page.goto('/notifications');
  const options=page.getByRole('button',{name:'Notification settings',exact:true});
  const prefs=page.locator('[aria-labelledby="push-type-ticket_created"]');await expect(prefs).toHaveAttribute('aria-checked','true');
  const reads=[];page.on('request',req=>{if(req.method()==='GET'&&/\/push\//.test(req.url()))reads.push(req.url());});
  await page.evaluate(()=>{document.querySelector('main').style.minHeight='2000px';window.scrollTo({top:180,left:0,behavior:'instant'});});
  const scrollBefore=await page.evaluate(()=>scrollY);expect(scrollBefore).toBe(180);
  await options.evaluate(el=>el.click());
  const panel=page.locator('#notification-settings-panel');
  await expect(panel).toBeVisible();expect(await page.evaluate(()=>document.body.style.position)).toBe('fixed');
  await page.keyboard.press('Shift+Tab');expect(await panel.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close notification settings',exact:true})).toBeFocused();
  await prefs.focus();
  await page.setViewportSize({width:768,height:900});await expect(prefs).toBeFocused();
  expect(await panel.evaluate(el=>el.matches(':modal'))).toBe(false);expect((await panel.boundingBox()).width).toBeLessThan(768);
  expect(await page.evaluate(()=>document.body.style.position)).toBe('');
  expect(await page.evaluate(()=>scrollY)).toBe(scrollBefore);
  await page.setViewportSize({width:390,height:700});await expect(prefs).toBeFocused();expect(await panel.evaluate(el=>el.matches(':modal'))).toBe(true);
  expect(await page.evaluate(()=>document.body.style.top)).toBe(`-${scrollBefore}px`);
  await page.getByRole('button',{name:'Close notification settings',exact:true}).click();
  await expect(options).toBeFocused();expect(await page.evaluate(()=>scrollY)).toBe(scrollBefore);
  await options.click();await page.getByRole('button',{name:'Close notification settings',exact:true}).click();
  expect(reads).toEqual([]);
});

test('pending preference save survives phone close reopen and resize without duplicate reads or writes',async({page})=>{
  await page.setViewportSize({width:390,height:700});await fixture(page);await page.goto('/notifications');
  const options=page.getByRole('button',{name:'Notification settings',exact:true}),toggle=page.getByRole('switch',{name:'New tickets',exact:true});
  await options.click();await expect(toggle).toHaveAttribute('aria-checked','true');
  let release;const gate=new Promise(resolve=>{release=resolve;});let patches=0,reads=0;
  await page.route('http://127.0.0.1:8765/push/preferences',async route=>{
    if(route.request().method()==='PATCH'){
      patches++;await gate;return route.fulfill({json:{preferences:{...Object.fromEntries(keys.map(k=>[k,true])),ticket_created:false}},headers:{'Access-Control-Allow-Origin':'*'}});
    }
    if(route.request().method()==='GET')reads++;
    return route.fallback();
  });
  await toggle.click();await expect(toggle).toBeDisabled();
  await page.getByRole('button',{name:'Close notification settings',exact:true}).click();await expect(toggle).toBeHidden();
  await options.click();await expect(toggle).toBeDisabled();
  await page.setViewportSize({width:768,height:900});await expect(toggle).toBeDisabled();
  release();await expect(toggle).toBeEnabled();await expect(toggle).toHaveAttribute('aria-checked','false');
  expect(patches).toBe(1);expect(reads).toBe(0);
});
