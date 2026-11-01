import {test, expect} from '@playwright/test';

async function geometry(group) {
  return group.evaluate(el => {
    const track=el.firstElementChild, indicator=track.querySelector("[data-tab-indicator]");
    const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom}};
    return {track:rect(track),indicator:rect(indicator),buttons:[...track.querySelectorAll('button')].map(rect),active:rect(track.querySelector('[aria-pressed="true"]'))};
  });
}
async function aligned(group) {
  await expect.poll(async()=>{
    const g=await geometry(group);
    return Math.max(...['left','right','top','bottom'].map(k=>Math.abs(g.indicator[k]-g.active[k])));
  }).toBeLessThan(0.6);
  expect(await group.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await group.getByRole('button').evaluateAll(buttons=>buttons.every(button=>button.scrollWidth<=button.clientWidth+1&&button.scrollHeight<=button.clientHeight+1))).toBe(true);
  const g=await geometry(group);
  expect(Math.max(...g.buttons.map(b=>b.width))-Math.min(...g.buttons.map(b=>b.width))).toBeLessThan(0.6);
  expect(g.indicator.left).toBeGreaterThan(g.track.left);
  expect(g.indicator.right).toBeLessThan(g.track.right);
}
for(const locale of ['en','ja'])for(const width of [375,768,1440])test(`shared tabs align ${locale} ${width}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/tests/browser/fixtures/tab-group.html');
  if(locale==='ja')await page.getByRole('button',{name:'Language'}).click();
  for(const name of ['Status','Team views','Profile sections']){
    const group=page.getByRole('group',{name,exact:true});
    await aligned(group);
    const buttons=group.getByRole('button');
    for(let i=0;i<await buttons.count();i++){
      await buttons.nth(i).click();
      await expect(buttons.nth(i)).toHaveAttribute('aria-pressed','true');
      await aligned(group);
    }
    await buttons.last().press('Home');
    await expect(buttons.first()).toBeFocused();
    await aligned(group);
    await buttons.first().press('ArrowLeft');
    await expect(buttons.last()).toBeFocused();
    await aligned(group);
  }
  await page.screenshot({path:testInfo.outputPath(`tabs-${locale}-${width}.png`),fullPage:true});
  await page.setViewportSize({width:width===375?812:375,height:900});
  await page.getByRole('button',{name:'Language'}).click();
  // Font metrics can change without a viewport resize (font loading / text zoom).
  await page.addStyleTag({content:'button {font-family: monospace !important; font-size: 22px !important}'});
  for(const name of ['Status','Team views','Profile sections'])await aligned(page.getByRole('group',{name,exact:true}));
});

test('indicator stays bounded throughout repeated transitions and reduced motion',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto('/tests/browser/fixtures/tab-group.html');
  const group=page.getByRole('group',{name:'Status',exact:true});
  await aligned(group);
  for(const index of [2,0,2,1,0]){
    await group.getByRole('button').nth(index).click();
    const bounded=await group.evaluate(async el=>{
      const track=el.firstElementChild,indicator=track.querySelector("[data-tab-indicator]");
      for(let i=0;i<24;i++){
        await new Promise(requestAnimationFrame);
        const t=track.getBoundingClientRect(),r=indicator.getBoundingClientRect();
        const clip=track.querySelector('[data-tab-indicator-clip]');
        const c=clip.getBoundingClientRect(),style=getComputedStyle(clip);
        // Only the decorative layer is clipped; focus and labels are siblings.
        if(!style.clipPath.startsWith('inset(')||style.pointerEvents!=='none')return false;
        if(Math.abs(c.left-t.left)>0.1||Math.abs(c.right-t.right)>0.1)return false;
        if(r.right<=t.left||r.left>=t.right)return false;
      }
      return true;
    });
    expect(bounded).toBe(true);
    await aligned(group);
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await group.getByRole('button').last().click();
  await aligned(group);
  expect(await group.locator('[data-tab-indicator]').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
});


test('Profile has a quick rebound between rows with bounded decoration',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/tests/browser/fixtures/tab-group.html');
  const group=page.getByRole('group',{name:'Profile sections',exact:true});
  await aligned(group);
  for(const index of [3,0,2,1]){
    const result=await group.evaluate(async(el,index)=>{
      const indicator=el.querySelector("[data-tab-indicator]");
      const buttons=[...el.querySelectorAll('button')], target=buttons[index].getBoundingClientRect();
      const start=indicator.getBoundingClientRect(),samples=[];
      buttons[index].click();
      for(let i=0;i<24;i++){
        await new Promise(requestAnimationFrame);
        const rect=indicator.getBoundingClientRect();
        samples.push({left:rect.left,top:rect.top});
      }
      return {samples,start:{left:start.left,top:start.top},target:{left:target.left,top:target.top}};
    },index);
    const distance=(a,b)=>Math.hypot(a.left-b.left,a.top-b.top);
    expect(result.samples.some(p=>distance(p,result.start)>1&&distance(p,result.target)>1)).toBe(true);
    const dx=result.target.left-result.start.left,dy=result.target.top-result.start.top;
    expect(result.samples.some(p=>(p.left-result.target.left)*dx+(p.top-result.target.top)*dy>Math.hypot(dx,dy))).toBe(true);
    await aligned(group);
  }
});
