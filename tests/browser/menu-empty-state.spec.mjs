import {test, expect} from "@playwright/test";

for (const locale of ["en","ja"]) {
  test("public menu no-match recovery: " + locale,async ({page})=>{
    await page.addInitScript(locale=>{
      localStorage.removeItem("barticket_token");
      localStorage.setItem("barticket_locale",locale);
    },locale);
    await page.route("**/*",route=>{
      return new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort();
    });
    await page.route("http://127.0.0.1:8765/**",route=>{
      const path=new URL(route.request().url()).pathname;
      return route.fulfill({json:path==="/menu" ? {items:[{id:1,name:"Highball",category:"Whisky",prices:{standard:700}}]} : {has_accounts:true},headers:{"Access-Control-Allow-Origin":"*"}});
    });
    await page.goto("/menu");
    const input=page.getByRole("textbox",{name:locale==="ja" ? "メニューを検索" : "Search menu"});
    await input.fill("zzzznoresult");
    await expect(page.getByRole("status")).toContainText("zzzznoresult");
    await page.getByRole("button",{name:locale==="ja" ? "検索をクリア" : "Clear search"}).click();
    await expect(input).toHaveValue("");
    await expect(page.getByText("Highball",{exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:locale==="ja" ? "検索をクリア" : "Clear search"})).toHaveCount(0);
  });
}
