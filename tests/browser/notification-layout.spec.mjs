import {test,expect} from "@playwright/test";
const me={id:7,name:"Test Manager",email:"test@example.invalid",role:"manager",has_password:true};
async function fixture(page,{signedIn=true,missing=false,locale="en"}={}){
  const writes=[];
  await page.addInitScript(({signedIn,locale})=>{
    localStorage.setItem("barticket_locale",locale);
    if(signedIn)localStorage.setItem("barticket_token","TEST_ONLY");
  },{signedIn,locale});
  await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1" ? route.continue() : route.abort());
  await page.route("http://127.0.0.1:8765/**",async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS"}});
    let status=200,body={};
    if(req.method()!=="GET")writes.push(req.method()+" "+path);
    if(path==="/auth/status")body={has_accounts:true};
    else if(path==="/auth/login")body={token:"TEST_ONLY",user:me};
    else if(path==="/auth/me")body=me;
    else if(path==="/shifts/current")body=null;
    else if(path==="/menu")body={items:[]};
    else if(path==="/notices")body={notices:[]};
    else if(path==="/tickets/42"){
      status=missing?404:200;
      body=missing?{detail:"Not found"}:{id:42,name:"季節限定の特別な日本のお客様の長い名前".repeat(3),status:"paid",total:700,guest_count:0,cover_charge_total:0,cover_charge_per_person:0,items:[{id:1,name:"VeryLongUnbrokenSpecialEditionWhiskyName".repeat(4),quantity:1,unit_price:700,subtotal:700}],staff_drinks:[],payment:null,created_at:1,shift_id:2};
    } else if(path==="/push/preferences")body={preferences:Object.fromEntries("ticket_created ticket_updated ticket_payment_recorded ticket_payment_deferred ticket_balance_written_off ticket_payment_corrected ticket_closed stock staff_drink shift_opened shift_closed shift_kept_open punch_corrected clock_in clock_out noon_clock_out".split(" ").map(key=>[key,true]))};
    else if(path.startsWith("/push/")){status=503;body={detail:"Disabled in test"};}
    else if(path==="/tickets")body=[];
    await route.fulfill({status,json:body,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  return writes;
}

for(const locale of ["en","ja"])for(const width of [320,1280])test("notification visual long names "+locale+width,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 const writes=await fixture(page,{locale});
 await page.goto("/notifications?ticket=42");
 const panel=page.getByRole("region",{name:locale==="ja"?"通知の伝票":"Linked ticket"});
 await expect(panel).toBeVisible();
 await page.screenshot({path:testInfo.outputPath("notification.png"),fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const amount=await panel.locator("li strong").boundingBox();
 expect(amount.x+amount.width).toBeLessThanOrEqual(width);
 expect(writes).toEqual([]);
});
for(const locale of ["en","ja"])for(const width of [320,1280])test("notification loading empty error "+locale+width,async({page},testInfo)=>{
 await page.setViewportSize({width,height:900});
 const writes=await fixture(page,{locale});
 let finish;
 const gate=new Promise(resolve=>{finish=resolve;});
 await page.route("http://127.0.0.1:8765/notices",async route=>{if(route.request().method()==="OPTIONS")return route.fallback();await gate;await route.fulfill({json:{notices:[]},headers:{"Access-Control-Allow-Origin":"*"}});});
 await page.goto("/notifications");
 await expect(page.getByText(locale==="ja"?"通知を読み込み中…":"Loading notifications…",{exact:true})).toBeVisible();
 finish();
 await expect(page.getByText(locale==="ja"?"品切れの通知はありません。":"No stock alerts.",{exact:true})).toBeVisible();
 await page.route("http://127.0.0.1:8765/notices",route=>route.request().method()==="OPTIONS"?route.fallback():route.fulfill({status:400,json:{detail:"Unavailable"},headers:{"Access-Control-Allow-Origin":"*"}}));
 await page.evaluate(()=>window.dispatchEvent(new Event("barticket-notices")));
 await expect(page.getByRole("alert")).toContainText(locale==="ja"?"通知を更新できませんでした":"Could not refresh notifications");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath("notification-error.png"),fullPage:true});
 expect(writes).toEqual([]);
});

