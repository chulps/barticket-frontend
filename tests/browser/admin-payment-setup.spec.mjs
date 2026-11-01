import {test,expect} from "@playwright/test";
async function fixture(page,{readStatus=200,canConfigure=true,accessStatus=200,direct=false,accountId=902,holdAccess=false,holdSetup=false}={}) {
  const state={accountId,reads:0,accessReads:0,canConfigure,accessStatus,writes:[],readStatus,writeStatus:200,revision:0,
    saved:{provider:"unknown",channel:"online",methods:[],processing_status:"not_connected"}};
  let accessGate=null,setupGate=null;
  if(holdAccess)accessGate=new Promise(resolve=>{state.releaseAccess=resolve;});
  if(holdSetup)setupGate=new Promise(resolve=>{state.releaseSetup=resolve;});
  await page.addInitScript(()=>{
    localStorage.setItem("barticket_token","PAYMENT_SETUP_TEST_OWNER");
    localStorage.setItem("barticket_locale","en");
  });
  await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
  await page.route("http://127.0.0.1:8765/**",async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,PUT,OPTIONS"}});
    let data=[],status=200;
    const account={id:state.accountId,name:state.accountId===902?"Nori":"Chuck",email:"nori@example.invalid",role:"manager"};
    if(path==="/admin/payment-setup/access"){state.accessReads++;status=state.accessStatus;data={can_configure:state.canConfigure};if(accessGate){const gate=accessGate;accessGate=null;await gate;}}
    else if(path==="/admin/payment-setup"){
      if(req.method()==="GET"){state.reads++;status=state.readStatus;data={...state.saved,revision:state.revision};if(setupGate){const gate=setupGate;setupGate=null;await gate;}}
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
  await page.goto(direct?"/admin?section=payments":"/admin");
  if(direct)return state;
  if(page.viewportSize().width<570)await page.getByRole("combobox",{name:"Admin section",exact:true}).selectOption("payments");
  else await page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true}).click();
  return state;
}
test("only an owner-authorized response exposes payment settings",async({page})=>{
  const state=await fixture(page,{readStatus:403});
  await expect.poll(()=>state.reads).toBeGreaterThan(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Save setup preferences",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Reload saved setup",exact:true})).toHaveCount(0);
  expect(state.reads).toBe(1);
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

for(const width of [390,1280])test(`nonowner payment capability hides navigation and avoids private reads at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});const state=await fixture(page,{canConfigure:false,accountId:901,direct:true});
 await expect(page.getByRole("alert")).toContainText("Only the payment account owner");
 await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toHaveCount(0);
 await expect(page.locator('option[value="payments"]:not([disabled])')).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Reload saved setup",exact:true})).toHaveCount(0);
 expect(state.reads).toBe(0);expect(state.writes).toEqual([]);
});
test("unavailable payment capability fails closed without a private request",async({page})=>{
 const state=await fixture(page,{accessStatus:503,direct:true});await expect(page.getByRole("alert")).toContainText("Saved setup is unavailable");
 expect(state.reads).toBe(0);await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toHaveCount(0);
 state.accessStatus=200;await page.getByRole("button",{name:"Reload saved setup",exact:true}).click();
 await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();expect(state.reads).toBe(1);expect(state.writes).toEqual([]);
});

async function switchToNonowner(page,state){
 state.accountId=901;state.canConfigure=false;
 await page.evaluate(()=>{localStorage.setItem("barticket_token","PAYMENT_SETUP_NONOWNER");dispatchEvent(new Event("barticket-auth"));});
}
test("late owner capability cannot restore payment navigation or read settings after account change",async({page})=>{
 const state=await fixture(page,{direct:true,holdAccess:true});await expect.poll(()=>state.accessReads).toBe(1);
 await switchToNonowner(page,state);await expect(page.getByRole("alert")).toContainText("Only the payment account owner");
 state.releaseAccess();await page.waitForLoadState("networkidle");
 await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toHaveCount(0);
 await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveCount(0);
 expect(state.reads).toBe(0);expect(state.writes).toEqual([]);
});
test("late private setup response cannot expose owner settings to another account",async({page})=>{
 const state=await fixture(page,{direct:true,holdSetup:true});await expect.poll(()=>state.reads).toBe(1);
 await switchToNonowner(page,state);await expect(page.getByRole("alert")).toContainText("Only the payment account owner");
 state.releaseSetup();await page.waitForLoadState("networkidle");await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveCount(0);
 expect(state.reads).toBe(1);expect(state.writes).toEqual([]);
});

test("revoked payment capability clears an open owner form on revalidation",async({page})=>{
 const state=await fixture(page);await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();
 const before=state.reads;state.canConfigure=false;
 await page.evaluate(()=>dispatchEvent(new Event("focus")));
 await expect(page.getByRole("alert")).toContainText("Only the payment account owner");
 await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveCount(0);
 await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toHaveCount(0);
 expect(state.reads).toBe(before);expect(state.writes).toEqual([]);
});

test("failed capability revalidation hides owner settings until explicit access recovery",async({page})=>{
 const state=await fixture(page);await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();
 const before=state.reads;state.accessStatus=503;await page.evaluate(()=>dispatchEvent(new Event("focus")));
 await expect(page.getByRole("alert")).toContainText("Saved setup is unavailable");await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveCount(0);expect(state.reads).toBe(before);
 state.accessStatus=200;await page.getByRole("button",{name:"Reload saved setup",exact:true}).click();await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();
 await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toBeVisible();expect(state.reads).toBe(before+1);expect(state.writes).toEqual([]);
});

test("Stripe setup is an explicit preference choice with provider-hosted registration",async({page})=>{
  const state=await fixture(page);
  await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveValue("unknown");
  await page.getByRole("button",{name:"Choose Stripe online setup",exact:true}).click();
  await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveValue("stripe");
  await expect(page.getByRole("combobox",{name:"Payment channel",exact:true})).toHaveValue("online");
  const guide=page.getByRole("region",{name:"Stripe online setup",exact:true});
  await guide.getByText("Prepare your Stripe account",{exact:true}).click();
  await expect(guide).toContainText("Account registration alone does not enable ticket payments");
  await expect(guide.getByRole("link",{name:"Create a Stripe account"})).toHaveAttribute("href","https://dashboard.stripe.com/register");
  await expect(guide.getByRole("link",{name:"Open Stripe Dashboard"})).toHaveAttribute("href","https://dashboard.stripe.com/");
  expect(state.writes).toEqual([]);
  await page.getByRole("button",{name:"Save setup preferences",exact:true}).click();
  await expect.poll(()=>state.writes.length).toBe(1);
  expect(state.writes[0]).toMatchObject({provider:"stripe",channel:"online",methods:[]});
  await expect(page.getByText("Payment processing: not connected",{exact:true})).toBeVisible();
  await page.getByRole("combobox",{name:"Payment channel",exact:true}).selectOption("terminal");
  await expect(guide).toHaveCount(0);
});

for (const locale of ['en', 'ja']) test(`Stripe guidance stays conditional and disconnected on a 320px phone (${locale})`,async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:800});
  const state=await fixture(page);
  await page.getByRole('button',{name:'Choose Stripe online setup',exact:true}).click();
  if(locale==='ja') await page.getByRole('switch').click();
  const guide=page.getByRole('region',{name:locale==='ja'?'Stripeのオンライン設定':'Stripe online setup',exact:true});
  await guide.getByText(locale==='ja'?'Stripeアカウントの準備':'Prepare your Stripe account',{exact:true}).click();
  await expect(guide).toContainText(locale==='ja'?'既存のStripeアカウントと所有者を確認':'confirm whether the bar already has a Stripe account');
  await expect(page.getByText(locale==='ja'?'決済処理：未接続':'Payment processing: not connected',{exact:true})).toBeVisible();
  await expect(page.getByText(locale==='ja'?'ここで選択しても未保存の希望が変わるだけ':'Choosing it here only edits this draft',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`payment-guide-${locale}.png`),fullPage:true});
  expect(state.writes).toEqual([]);
});

test('saved terminal provider remains unchanged until an explicit save and draft choice can be abandoned',async({page})=>{
  const state=await fixture(page);
  state.saved={provider:'square',channel:'terminal',methods:['card'],processing_status:'not_connected'};
  await page.reload();
  const provider=page.getByRole('combobox',{name:'Current or proposed provider',exact:true});
  const channel=page.getByRole('combobox',{name:'Payment channel',exact:true});
  await expect(provider).toHaveValue('square'); await expect(channel).toHaveValue('terminal');
  await page.getByRole('button',{name:'Choose Stripe online setup',exact:true}).click();
  await expect(provider).toHaveValue('stripe'); await expect(channel).toHaveValue('online');
  expect(state.saved.provider).toBe('square'); expect(state.writes).toEqual([]);
  await page.reload();
  await expect(provider).toHaveValue('square'); await expect(channel).toHaveValue('terminal');
  await expect(page.getByRole('region',{name:'Stripe online setup',exact:true})).toHaveCount(0);
  expect(state.writes).toEqual([]);
});
