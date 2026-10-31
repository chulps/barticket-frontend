import { test, expect } from '@playwright/test';
const keys=['ticket_created','ticket_updated','ticket_payment_recorded','ticket_payment_deferred','ticket_balance_written_off','ticket_payment_corrected','ticket_closed','stock','staff_drink','shift_opened','shift_closed','shift_kept_open','punch_corrected','clock_in','clock_out','noon_clock_out'];
async function fixture(page) {
  let prefs=Object.fromEntries(keys.map(k=>[k,true]));const writes=[];
  await page.addInitScript(()=>{localStorage.setItem('barticket_token','TEST_ONLY');localStorage.setItem('barticket_locale','en');});
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
    else if(path==='/push/preferences') {
      if(req.method()==='PATCH'){writes.push(req.postDataJSON());prefs={...prefs,...req.postDataJSON().preferences};}
      body={preferences:prefs};
    } else if(path.startsWith('/push/')){status=503;body={detail:'Fixture push disabled'};}
    await route.fulfill({status,json:body,headers});
  });
  return writes;
}
for(const width of [320,1280])test(`notification preferences accessible at ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});const writes=await fixture(page);await page.goto('/notifications');await page.getByRole('button',{name:'Notification type settings'}).click();
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
  await fixture(page);await page.goto('/notifications');await page.getByRole('button',{name:'Notification type settings'}).click();const toggle=page.getByRole('switch',{name:'New tickets',exact:true});await expect(toggle).toBeVisible();
  await page.route('http://127.0.0.1:8765/push/preferences',route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{detail:'offline'},headers:{'Access-Control-Allow-Origin':'*'}}):route.fallback());
  await toggle.click();await expect(page.getByRole('alert')).toContainText('Couldn’t confirm the save');await expect(toggle).toHaveCount(0);
  await page.getByRole('button',{name:'Reload settings'}).click();await expect(toggle).toHaveAttribute('aria-checked','true');
});

test('type controls are disclosed with keyboard, dismissible, and switches never gain blue hover fill',async({page})=>{
  await page.setViewportSize({width:320,height:900}); await fixture(page); await page.goto('/notifications');
  const options=page.getByRole('button',{name:'Notification type settings'}), toggle=page.getByRole('switch',{name:'New tickets',exact:true});
  await expect(options).toHaveAttribute('aria-expanded','false'); await expect(toggle).toBeHidden();
  await options.focus(); await page.keyboard.press('Enter'); await expect(toggle).toBeVisible();
  await toggle.hover();
  expect(await toggle.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await toggle.evaluate(el=>getComputedStyle(el,'::before').backgroundColor)).toBe('rgb(30, 202, 107)');
  await toggle.focus(); await page.keyboard.press('Escape'); await expect(toggle).toBeHidden(); await expect(options).toBeFocused();
  await options.click(); await page.getByRole('heading',{name:'Sounds while BarTicket is open'}).click();
  await expect(toggle).toBeHidden(); expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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
  for(const name of ['Preview new ticket','Preview stockout','Preview cha-ching'])await page.getByRole('button',{name,exact:true}).click();
  expect(await page.evaluate(()=>window.audioStarts)).toBe(7);
  const toggle=page.getByRole('switch',{name:'Use sounds on this device'}); await expect(toggle).toHaveAttribute('aria-checked','false');
  await toggle.click(); await expect(toggle).toHaveAttribute('aria-checked','true');
  await page.evaluate(()=>{window.testAudio.state='interrupted';window.testAudio.onstatechange();});
  await expect(page.getByRole('button',{name:'Resume sounds',exact:true})).toBeVisible(); await expect(toggle).toHaveAttribute('aria-checked','true');
  await page.evaluate(()=>{window.testAudio.state='running';window.testAudio.onstatechange();});
  await expect(page.getByRole('button',{name:'Resume sounds',exact:true})).toBeVisible(); expect(await page.evaluate(()=>window.audioStarts)).toBe(7);
});
