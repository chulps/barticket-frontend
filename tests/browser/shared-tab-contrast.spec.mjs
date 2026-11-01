import {test,expect} from '@playwright/test';
import {assertTabContrast} from './helpers/tab-contrast.mjs';

for(const locale of ['en','ja'])for(const width of [320,768,1280])test(`shared selector effective contrast ${locale} ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/tests/browser/fixtures/tab-group.html');
 if(locale==='ja')await page.getByRole('button',{name:'Language',exact:true}).click();
 await expect(page.locator('html')).not.toHaveClass(/light/);
 for(const name of ['Status','Team views','Profile sections']){
  const group=page.getByRole('group',{name,exact:true});
  await expect(group).toBeVisible();
  // Baseline consumer canvas plus the existing dark card surface used by nested selectors.
  for(const surface of ['var(--background-color)','var(--surface-card)']){
   await group.evaluate((node,surface)=>{node.style.backgroundColor=surface;},surface);
   await assertTabContrast(group,page);
  }
 }
 await page.screenshot({path:testInfo.outputPath(`audit-tab-contrast-${locale}-${width}.png`),fullPage:true});
});
