import { test, expect } from "@playwright/test";

const longName = "A very long limited release whisky name with distillery and vintage";
const longDescription = "Whisky, vermouth and bitters, stirred over ice with a fresh orange garnish. Balanced, gently bitter and aromatic.";
const menu = {items:[
  {id:1,name:longName,category:"Whisky",subcategory:"Rare bottles",prices:{"15ml":1400,"30ml":2800},description:longDescription},
  {id:2,name:"Prep ingredient",category:"Hidden ingredients",cocktailIngredient:true,prices:{standard:50}},
  ...Array.from({length:8},(_,i)=>({id:i+10,name:"Cocktail selection "+i,category:"Cocktails",prices:{standard:800},description:longDescription})),
  {id:31,name:"Seasonal selection",category:"Seasonal and limited releases",prices:{standard:900}},
  {id:30,name:"Bottle selection",category:"Beer",volume:"330ml",prices:{standard:700}},
]};
async function fixture(page, locale) {
  await page.addInitScript(locale=>{
    localStorage.removeItem("barticket_token");
    localStorage.setItem("barticket_locale",locale);
  },locale);
  const mutations=[];
  await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
  await page.route("http://127.0.0.1:8765/**",route=>{
    if(!["GET","OPTIONS"].includes(route.request().method())) mutations.push(route.request().url());
    const path=new URL(route.request().url()).pathname;
    return route.fulfill({json:path==="/menu"?menu:{has_accounts:true},headers:{"Access-Control-Allow-Origin":"*"}});
  });
  await page.goto("/menu");
  return mutations;
}
for(const locale of ["en","ja"]) for(const width of [320,1280]) {
  test("menu category browsing and price pairing "+locale+" "+width,async({page},testInfo)=>{
    await page.setViewportSize({width,height:900});
    const mutations=await fixture(page,locale);
    const nav=page.getByRole("navigation",{name:locale==="ja"?"ドリンクのカテゴリー":"Drink categories"});
    await expect(nav.getByRole("link")).toHaveCount(4);
    const hrefs=await nav.locator("a").evaluateAll(links=>links.map(link=>decodeURIComponent(link.getAttribute("href"))));
    expect(hrefs).toEqual(["#menu-category-Beer","#menu-category-Cocktails","#menu-category-Seasonal and limited releases","#menu-category-Whisky"]);
    await expect(page.getByText("Prep ingredient",{exact:true})).toHaveCount(0);
    const sections=page.locator('section[id^="menu-category-"]');
    await expect(sections).toHaveCount(4);
    const boxes=await sections.evaluateAll(nodes=>nodes.map(node=>({top:node.getBoundingClientRect().top,bottom:node.getBoundingClientRect().bottom})));
    expect(boxes[0].bottom).toBeLessThan(boxes[1].top);
    expect(boxes[1].bottom).toBeLessThan(boxes[2].top);
    expect(boxes[2].bottom).toBeLessThan(boxes[3].top);
    await nav.locator('a[href="#menu-category-Seasonal%20and%20limited%20releases"]').click();
    await expect(page.locator('[id="menu-category-Seasonal and limited releases"]')).toBeInViewport();
    await nav.locator('a[href="#menu-category-Whisky"]').click();
    const whisky=page.locator('[id="menu-category-Whisky"]');
    await expect(whisky).toBeInViewport();
    const row=page.locator('[aria-label="'+longName+'"]');
    await expect(row.getByText("15ml",{exact:true})).toBeVisible();
    await expect(row.getByText("30ml",{exact:true})).toBeVisible();
    await expect(row.getByText("¥1,400",{exact:true})).toBeVisible();
    await expect(row.getByText("¥2,800",{exact:true})).toBeVisible();
    expect(await row.locator("p").filter({hasText:longDescription}).evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(14);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const search=page.getByRole("textbox",{name:locale==="ja"?"メニューを検索":"Search menu"});
    await search.fill("Bottle selection");
    await expect(nav.getByRole("link")).toHaveCount(1);
    await expect(page.getByText("Bottle selection",{exact:true})).toBeVisible();
    await search.fill("");
    await expect(nav.getByRole("link")).toHaveCount(4);
    expect(mutations).toEqual([]);
    if(locale==="en") await page.screenshot({path:testInfo.outputPath("menu-layout.png"),fullPage:true});
  });
}
