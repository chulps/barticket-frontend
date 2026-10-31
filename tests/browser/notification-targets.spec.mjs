import {test,expect} from "@playwright/test";
const me={id:7,name:"Test Manager",email:"test@example.invalid",role:"manager",has_password:true};
async function fixture(page,{signedIn=true,missing=false}={}){
  const writes=[];
  await page.addInitScript(signedIn=>{
    localStorage.setItem("barticket_locale","en");
    if(signedIn)localStorage.setItem("barticket_token","TEST_ONLY");
  },signedIn);
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
      body=missing?{detail:"Not found"}:{id:42,name:"Linked guest",status:"paid",total:700,guest_count:0,cover_charge_total:0,cover_charge_per_person:0,items:[{id:1,name:"Highball",quantity:1,unit_price:700,subtotal:700}],staff_drinks:[],payment:null,created_at:1,shift_id:2};
    } else if(path.startsWith("/push/")){status=503;body={detail:"Disabled in test"};}
    else if(path==="/tickets")body=[];
    await route.fulfill({status,json:body,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  return writes;
}
test("notification opens referenced paid ticket read-only, regardless of current shift",async({page})=>{
  const writes=await fixture(page);
  await page.goto("/notifications?ticket=42&from_push=1");
  const detail=page.getByRole("region",{name:"Linked ticket"});
  await expect(detail).toContainText("Linked guest · #42");
  await expect(detail).toContainText("Highball × 1");
  await expect(detail).toContainText("Paid · Read-only");
  await expect(detail.getByRole("button")).toHaveCount(0);
  expect(writes).toEqual([]);
});
test("missing target explains fallback on Notifications without writes",async({page})=>{
  const writes=await fixture(page,{missing:true});
  await page.goto("/notifications?ticket=42&from_push=1");
  await expect(page.getByRole("alert")).toContainText("Your notifications are shown below");
  await expect(page.getByRole("heading",{name:"Notifications",exact:true})).toBeVisible();
  expect(writes).toEqual([]);
});
test("sign in resumes the tapped target",async({page})=>{
  const writes=await fixture(page,{signedIn:false});
  await page.goto("/notifications?ticket=42&from_push=1");
  await page.getByLabel("Email",{exact:true}).fill("test@example.invalid");
  await page.getByLabel("Password",{exact:true}).fill("test-only-password");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByRole("region",{name:"Linked ticket"})).toContainText("#42");
  expect(writes).toEqual(["POST /auth/login"]);
});
