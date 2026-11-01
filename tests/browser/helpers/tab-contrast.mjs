import {expect} from '@playwright/test';

// Compute the painted text surface, not simply the transparent button background.
// Selected decoration is a sibling behind the button and must be composited too.
export async function tabContrast(button) {
 return button.evaluate(node=>{
  const rgba=value=>{
   const parts=value.match(/[\d.]+/g)?.map(Number);
   if(!parts || parts.length<3)throw new Error(`Unsupported computed color: ${value}`);
   return [...parts.slice(0,3),parts[3]??1];
  };
  const over=(front,back)=>front.slice(0,3).map((value,i)=>value*front[3]+back[i]*(1-front[3]));
  const ancestors=[];
  for(let p=node.parentElement;p;p=p.parentElement)ancestors.unshift(p);
  let background=[255,255,255];
  for(const ancestor of ancestors){
   const style=getComputedStyle(ancestor);
   if(style.backgroundImage!=='none'||Number(style.opacity)!==1)throw new Error('Unexpected image/opacity: update effective-surface measurement');
   background=over(rgba(style.backgroundColor),background);
  }
  let indicatorUsed=false;
  if(node.getAttribute('aria-pressed')==='true'){
   const indicator=node.closest('[role="group"]').querySelector('[data-tab-indicator]');
   const b=node.getBoundingClientRect(),i=indicator.getBoundingClientRect();
   if(Math.max(...['left','right','top','bottom'].map(key=>Math.abs(b[key]-i[key])))>0.6)throw new Error('Selected indicator not aligned');
   background=over(rgba(getComputedStyle(indicator).backgroundColor),background);
   indicatorUsed=true;
  }
  const style=getComputedStyle(node);
  if(Number(style.opacity)!==1)throw new Error('Unexpected text opacity');
  background=over(rgba(style.backgroundColor),background);
  const foreground=over(rgba(style.color),background);
  const luminance=rgb=>rgb.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0);
  const [lighter,darker]=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
  return {ratio:(lighter+0.05)/(darker+0.05),foreground,background,indicatorUsed};
 });
}
export async function assertTabContrast(group,page){
 await expect.poll(()=>group.evaluate(node=>{
  const indicator=node.querySelector('[data-tab-indicator]'),selected=node.querySelector('button[aria-pressed="true"]');
  if(!indicator||!selected)return Infinity;
  const a=indicator.getBoundingClientRect(),b=selected.getBoundingClientRect();
  return Math.max(...['left','right','top','bottom'].map(key=>Math.abs(a[key]-b[key])));
 })).toBeLessThan(0.6);
 const active=group.locator('button[aria-pressed="true"]');
 const inactive=group.locator('button[aria-pressed="false"]').first();
 await page.mouse.move(0,0);
 await expect.poll(async()=>(await tabContrast(active)).ratio).toBeGreaterThanOrEqual(4.5);
 expect((await tabContrast(active)).indicatorUsed).toBe(true);
 await expect.poll(async()=>(await tabContrast(inactive)).ratio).toBeGreaterThanOrEqual(4.5);
 expect((await tabContrast(inactive)).indicatorUsed).toBe(false);
 await inactive.hover();
 expect(await inactive.evaluate(node=>node.matches(':hover'))).toBe(true);
 await expect.poll(async()=>(await tabContrast(inactive)).ratio).toBeGreaterThanOrEqual(4.5);
 await page.mouse.move(0,0);
 // Keyboard focus without activating the inactive choice.
 await inactive.focus();
 await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 await expect(inactive).toBeFocused();
 expect(await inactive.evaluate(node=>node.matches(':focus-visible'))).toBe(true);
 await expect(inactive).toHaveAttribute('aria-pressed','false');
 await expect.poll(async()=>(await tabContrast(inactive)).ratio).toBeGreaterThanOrEqual(4.5);
 await active.hover();
 await expect.poll(async()=>(await tabContrast(active)).ratio).toBeGreaterThanOrEqual(4.5);
 await page.mouse.move(0,0);
 await active.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 await expect(active).toBeFocused();
 expect(await active.evaluate(node=>node.matches(':focus-visible'))).toBe(true);
 await expect.poll(async()=>(await tabContrast(active)).ratio).toBeGreaterThanOrEqual(4.5);
}
