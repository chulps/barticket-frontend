import {test,expect} from "@playwright/test";
async function fixture(page,{readStatus=200}={}) {
  const state={reads:0,writes:[],readStatus,writeStatus:200,revision:0,
    saved:{provider:"unknown",channel:"online",methods:[],processing_status:"not_connected"}};
  await page.addInitScript(()=>{
    localStorage.setItem("barticket_token","PAYMENT_SETUP_TEST_OWNER");
    localStorage.setItem("barticket_locale","en");
  });
  await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
  await page.route("http://127.0.0.1:8765/**",async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,PUT,OPTIONS"}});
    let data=[],status=200;
    const account={id:902,name:"Nori",email:"nori@example.invalid",role:"manager"};
    if(path==="/admin/payment-setup"){
      if(req.method()==="GET"){state.reads++;status=state.readStatus;data={...state.saved,revision:state.revision};}
      else {state.writes.push(req.postDataJSON());status=state.writeStatus;
        if(status===200){state.saved={...state.saved,...req.postDataJSON()};state.revision++;}
        data={...state.saved,revision:state.revision};
      }
      if(status!==200)data={detail:status===403?"Only the payment account owner can configure payments":"Setup unavailable"};
    }
    else if(path==="/auth/me")data=account;
    else if(path==="/users")data=[account];
    else if(path==="/shifts/current")data=null;
    else if(path==="/menu")data={items:[],coverCharge:500};
    else if(path==="/notices")data={notices:[]};
    else if(path==="/auth/status")data={has_accounts:true,google_enabled:false};
    else {status=404;data={detail:"Fixture endpoint unavailable"};}
    await route.fulfill({status,json:data,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  await page.goto("/admin");
  await page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true}).click();
  return state;
}
test("only an owner-authorized response exposes payment settings",async({page})=>{
  const state=await fixture(page,{readStatus:403});
  await expect.poll(()=>state.reads).toBeGreaterThan(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Save setup preferences",exact:true})).toHaveCount(0);
  expect(state.writes).toEqual([]);
});
test("language changes preserve unsaved payment setup selections",async({page})=>{
  const state=await fixture(page);
  const provider=page.getByRole("combobox",{name:"Current or proposed provider",exact:true});
  await expect(page.getByRole("button",{name:"Save setup preferences",exact:true})).toBeEnabled();
  await provider.selectOption("square");
  const before=state.reads;
  await page.getByRole("switch").click();
  await expect(page.getByRole("combobox",{name:"現在または検討中の決済会社",exact:true})).toHaveValue("square");
  expect(state.reads).toBe(before);
  expect(state.writes).toEqual([]);
});
test("uncertain writes require explicit reload and never replay automatically",async({page})=>{
  const state=await fixture(page);
  await expect(page.getByRole("button",{name:"Save setup preferences",exact:true})).toBeEnabled();
  await page.getByRole("combobox",{name:"Current or proposed provider",exact:true}).selectOption("stripe");
  state.writeStatus=409;
  await page.getByRole("button",{name:"Save setup preferences",exact:true}).click();
  await expect(page.getByRole("button",{name:"Reload saved setup",exact:true})).toBeVisible();
  expect(state.writes).toHaveLength(1);
  state.saved.provider="square";state.revision=7;
  await page.getByRole("button",{name:"Reload saved setup",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveValue("square");
  expect(state.writes).toHaveLength(1);
  state.writeStatus=200;
  await page.getByRole("button",{name:"Save setup preferences",exact:true}).click();
  await expect.poll(()=>state.writes.length).toBe(2);
  expect(state.writes[1].revision).toBe(7);
});
test("failed reads can recover without exposing a stale editable form",async({page})=>{
  const state=await fixture(page,{readStatus:503});
  await expect(page.getByRole("alert")).toContainText("Saved setup is unavailable");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  state.readStatus=200;state.saved.provider="square";
  await page.getByRole("button",{name:"Reload saved setup",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveValue("square");
  expect(state.writes).toEqual([]);
});
test("owner setup fits a narrow phone in both languages",async({page})=>{
  await page.setViewportSize({width:320,height:800});
  await fixture(page);
  await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();
  for(let i=0;i<2;i++){
    const panel=page.getByRole("heading",{name:i?"決済設定":"Payment setup",exact:true}).locator("..").locator("..");
    expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    if(i===0){
      await page.getByRole("button",{name:"Navigation menu",exact:true}).click();
      await page.getByRole("switch").click();
    }
  }
});
