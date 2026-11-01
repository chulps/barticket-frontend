import {test,expect} from "@playwright/test";
async function expandLegacyControls(page) {
 const advanced = page.getByText(/^(Advanced provider preferences|詳しい決済会社の設定)$/, { exact: true });
 await expect(advanced).toBeVisible();
 if (!(await advanced.evaluate(el => el.parentElement.open))) await advanced.click();
 const terminal = page.getByText(/^(Identify the current terminal|今の端末の機種を確認)$/, { exact: true });
 if (!(await terminal.evaluate(el => el.parentElement.open))) await terminal.click();
}
async function fixture(page,{showAdvanced=true,readStatus=200,canConfigure=true,accessStatus=200,direct=false,accountId=902,holdAccess=false,holdSetup=false}={}) {
  const state={accountId,reads:0,accessReads:0,canConfigure,accessStatus,writes:[],readStatus,writeStatus:200,revision:0,
    saved:{provider:"unknown",channel:"online",methods:[],processing_status:"not_connected"}};
  let accessGate=null,setupGate=null;
  if(holdAccess)accessGate=new Promise(resolve=>{state.releaseAccess=resolve;});
  if(holdSetup)setupGate=new Promise(resolve=>{state.releaseSetup=resolve;});
  await page.addInitScript(()=>{
    localStorage.setItem("barticket_token","PAYMENT_SETUP_TEST_OWNER");
    if (!localStorage.getItem("barticket_locale")) localStorage.setItem("barticket_locale","en");
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
  if (showAdvanced && canConfigure && accessStatus === 200 && readStatus === 200) await expandLegacyControls(page);
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
  await page.getByRole("button",{name:"Reload saved setup",exact:true}).click(); await expandLegacyControls(page);
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
  await page.getByRole("button",{name:"Reload saved setup",exact:true}).click(); await expandLegacyControls(page);
  await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveValue("square");
  expect(state.writes).toEqual([]);
});
test("owner setup fits a narrow phone in both languages",async({page})=>{
  await page.setViewportSize({width:320,height:800});
  await fixture(page);
  await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();
  for(let i=0;i<2;i++){
    const panel=page.getByRole("heading",{name:i?"決済設定":"Payment setup",exact:true}).locator("..").locator("..");
    const fit = await panel.evaluate(el=>({fits:el.scrollWidth<=el.clientWidth+1, width:el.clientWidth, scroll:el.scrollWidth, overflow:[...el.querySelectorAll("*")].filter(node=>node.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(node=>({tag:node.tagName,text:node.textContent.slice(0,70),right:node.getBoundingClientRect().right}))}));
    expect(fit.fits, JSON.stringify(fit)).toBe(true);
    if(i===0){
      await page.getByRole("button",{name:"Navigation menu",exact:true}).click();
      await page.getByRole("switch").click();
    }
  }
});

for(const width of [390,1280])test(`nonowner can read the generic guide without private setup reads at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:844});const state=await fixture(page,{canConfigure:false,accountId:901,direct:true});
 await expect(page.getByRole("alert")).toContainText("Only the payment account owner");
 await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toHaveCount(width < 570 ? 0 : 1);
 await expect(page.locator('option[value="payments"]:not([disabled])')).toHaveCount(1);
 await expect(page.getByRole("button",{name:"Reload saved setup",exact:true})).toHaveCount(0);
 expect(state.reads).toBe(0);expect(state.writes).toEqual([]);
});
test("unavailable payment capability fails closed without a private request",async({page})=>{
 const state=await fixture(page,{accessStatus:503,direct:true});await expect(page.getByRole("alert")).toContainText("Saved setup is unavailable");
 expect(state.reads).toBe(0);await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toHaveCount(1);
 state.accessStatus=200;await page.getByRole("button",{name:"Reload saved setup",exact:true}).click(); await expandLegacyControls(page);
 await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();expect(state.reads).toBe(1);expect(state.writes).toEqual([]);
});

async function switchToNonowner(page,state){
 state.accountId=901;state.canConfigure=false;
 await page.evaluate(()=>{localStorage.setItem("barticket_token","PAYMENT_SETUP_NONOWNER");dispatchEvent(new Event("barticket-auth"));});
}
test("late owner capability cannot restore private settings after account change",async({page})=>{
 const state=await fixture(page,{direct:true,holdAccess:true});await expect.poll(()=>state.accessReads).toBe(1);
 await switchToNonowner(page,state);await expect(page.getByRole("alert")).toContainText("Only the payment account owner");
 state.releaseAccess();await page.waitForLoadState("networkidle");
 await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toHaveCount(1);
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
 await expect(page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Payment setup",exact:true})).toHaveCount(1);
 expect(state.reads).toBe(before);expect(state.writes).toEqual([]);
});

test("failed capability revalidation hides owner settings until explicit access recovery",async({page})=>{
 const state=await fixture(page);await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();
 const before=state.reads;state.accessStatus=503;await page.evaluate(()=>dispatchEvent(new Event("focus")));
 await expect(page.getByRole("alert")).toContainText("Saved setup is unavailable");await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toHaveCount(0);expect(state.reads).toBe(before);
 state.accessStatus=200;await page.getByRole("button",{name:"Reload saved setup",exact:true}).click(); await expandLegacyControls(page);await expect(page.getByRole("combobox",{name:"Current or proposed provider",exact:true})).toBeVisible();
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

for (const theme of ['dark', 'light']) for (const locale of ['en', 'ja']) test(`Stripe guidance stays conditional and disconnected on a 320px phone (${locale}, ${theme})`,async({page},testInfo)=>{
  await page.setViewportSize({width:320,height:800});
  const state=await fixture(page);
  await page.getByRole('button',{name:'Choose Stripe online setup',exact:true}).click();
  if(locale==='ja') {
    await page.getByRole('button',{name:'Navigation menu',exact:true}).click();
    await page.getByRole('switch').click();
    await page.keyboard.press('Escape');
  }
  await page.evaluate(theme=>document.documentElement.classList.toggle('light',theme==='light'),theme);
  const guide=page.getByRole('region',{name:locale==='ja'?'Stripeのオンライン設定':'Stripe online setup',exact:true});
  await guide.getByText(locale==='ja'?'Stripeアカウントの準備':'Prepare your Stripe account',{exact:true}).click();
  await expect(guide).toContainText(locale==='ja'?'既存のStripeアカウントと所有者を確認':'confirm whether the bar already has a Stripe account');
  await expect(page.getByText(locale==='ja'?'決済処理：未接続':'Payment processing: not connected',{exact:true})).toBeVisible();
  await expect(page.getByText(locale==='ja'?'ここで選択しても未保存の希望が変わるだけ':'Choosing it here only edits this draft',{exact:false})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const labelContrast=await guide.locator('..').locator('label').evaluateAll(labels=>{
    const luminance=color=>{const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;};
    return labels.map(label=>{let panel=label;while(getComputedStyle(panel).backgroundColor==='rgba(0, 0, 0, 0)')panel=panel.parentElement;const a=luminance(getComputedStyle(label).color),b=luminance(getComputedStyle(panel).backgroundColor);return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);});
  });
  expect(labelContrast.length).toBeGreaterThan(0);
  for(const contrast of labelContrast)expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({path:testInfo.outputPath(`payment-guide-${locale}-${theme}.png`),fullPage:true});
  expect(state.writes).toEqual([]);
});

test('saved terminal provider remains unchanged until an explicit save and draft choice can be abandoned',async({page})=>{
  const state=await fixture(page);
  state.saved={provider:'square',channel:'terminal',methods:['card'],processing_status:'not_connected'};
  await page.reload(); await expandLegacyControls(page);
  const provider=page.getByRole('combobox',{name:'Current or proposed provider',exact:true});
  const channel=page.getByRole('combobox',{name:'Payment channel',exact:true});
  await expect(provider).toHaveValue('square'); await expect(channel).toHaveValue('terminal');
  await page.getByRole('button',{name:'Choose Stripe online setup',exact:true}).click();
  await expect(provider).toHaveValue('stripe'); await expect(channel).toHaveValue('online');
  expect(state.saved.provider).toBe('square'); expect(state.writes).toEqual([]);
  await page.reload(); await expandLegacyControls(page);
  await expect(provider).toHaveValue('square'); await expect(channel).toHaveValue('terminal');
  await expect(page.getByRole('region',{name:'Stripe online setup',exact:true})).toHaveCount(0);
  expect(state.writes).toEqual([]);
});

for (const locale of ['en', 'ja']) test(`owner saves terminal identification only, ${locale}, 320px`, async ({ page }, testInfo) => {
 await page.setViewportSize({ width: 320, height: 844 });
 const state = await fixture(page);
 const model = page.getByRole('combobox', { name: 'Terminal model', exact: true });
 const connection = page.getByRole('combobox', { name: 'Connection type noted on the device or paperwork (optional)', exact: true });
 await expect(model).toHaveValue('unknown'); await expect(connection).toHaveValue('unknown');
 await expect(model.locator('option')).toHaveText(['Not sure', 'VEGA3000 MX', 'VEGA3000 Countertop', 'VEGA3000 Mobile2', 'SATURN1000F2', 'Other model']);
 await model.selectOption('vega3000_mx'); await expect(connection).toHaveValue('unknown');
 // A terminal-note save must not save unrelated unsaved provider drafts.
 await page.getByRole('combobox', { name: 'Current or proposed provider', exact: true }).selectOption('square');
 await connection.selectOption('wifi');
 if (locale === 'ja') await page.evaluate(() => { localStorage.setItem('barticket_locale', 'ja'); dispatchEvent(new Event('barticket-locale')); });
 const save = page.getByRole('button', { name: locale === 'ja' ? '端末メモを保存' : 'Save terminal notes', exact: true });
 await save.evaluate(el => { el.click(); el.click(); });
 await expect.poll(() => state.writes.length).toBe(1);
 expect(state.writes[0]).toEqual({ provider: 'unknown', channel: 'online', methods: [], revision: 0, terminal_model: 'vega3000_mx', terminal_connection: 'wifi' });
 await expect(page.getByText(locale === 'ja' ? '端末メモを保存しました。接続や決済の有効化は行っていません。' : 'Terminal notes saved. Nothing was connected or enabled.', { exact: true })).toBeVisible();
 await page.reload(); await expandLegacyControls(page);
 await expect(page.getByRole('combobox', { name: locale === 'ja' ? '端末の機種' : 'Terminal model', exact: true })).toHaveValue('vega3000_mx');
 expect(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth + 1)).toBe(true);
 const noteFields = page.getByRole('group', { name: locale === 'ja' ? '所有者の端末識別メモ' : 'Owner’s terminal identification notes', exact: true });
 expect(await noteFields.evaluate(el => [...el.querySelectorAll('select,button')].every(control => control.getBoundingClientRect().right <= el.getBoundingClientRect().right))).toBe(true);
 await page.screenshot({ path: testInfo.outputPath('terminal-identification-owner.png'), fullPage: true });
});
test('manager sees model guide but no private owner notes or save controls', async ({ page }, testInfo) => {
 await page.setViewportSize({ width: 390, height: 844 });
 const state = await fixture(page, { canConfigure: false, accountId: 901, direct: true });
 await page.getByText('Identify the current terminal', { exact: true }).click();
 const guide = page.getByRole('region', { name: 'Terminal identification guide', exact: true });
 await expect(guide).toBeVisible();
 await guide.getByText('Model list and official references', { exact: true }).click();
 await expect(guide.getByRole('link', { name: 'VEGA3000 MX', exact: false })).toBeVisible();
 await expect(page.getByRole('combobox', { name: 'Terminal model', exact: true })).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Save terminal notes', exact: true })).toHaveCount(0);
 await expect(page.getByRole('combobox', { name: 'Current or proposed provider', exact: true })).toHaveCount(0);
 expect(state.reads).toBe(0); expect(state.writes).toHaveLength(0);
 await page.screenshot({ path: testInfo.outputPath('terminal-identification-manager.png'), fullPage: true });
});

const planNames = {
 current_jms: ['Keep the current JMS terminal', '今のJMS端末を使う'],
 phone_square: ['Use the shop’s phone · Square', 'お店のスマホを使う・Square'],
 linked_jms: ['Link the bill to the JMS terminal', '会計金額をJMS端末へ送る'],
 advanced_stripe: ['Build phone payments with Stripe Terminal', 'Stripe Terminalでスマホ決済を作る'],
};
for (const locale of ['en', 'ja']) for (const plan of Object.keys(planNames)) test(`simple decision saves only ${plan}, ${locale}, 320px`, async ({ page }, testInfo) => {
 await page.setViewportSize({ width: 320, height: 844 });
 const state = await fixture(page, { showAdvanced: false });
 if (locale === 'ja') await page.evaluate(() => { localStorage.setItem('barticket_locale', 'ja'); dispatchEvent(new Event('barticket-locale')); });
 const guide = page.getByRole('region', { name: locale === 'ja' ? '支払い方法の選び方' : 'Choose a payment approach', exact: true });
 await expect(guide).toBeVisible();
 const save = page.getByRole('button', { name: locale === 'ja' ? '希望する方法を保存' : 'Save preferred option', exact: true });
 await expect(save).toBeDisabled();
 await expect(page.getByRole('combobox', { name: locale === 'ja' ? '現在または検討中の決済会社' : 'Current or proposed provider', exact: true })).not.toBeVisible();
 await expect(guide.getByRole('button')).toHaveCount(3);
 if (plan === 'advanced_stripe') await guide.getByText(locale === 'ja' ? 'ほかの方法・Stripe（開発が必要）' : 'More options · Stripe (more setup work)', { exact: true }).click();
 const card = guide.getByRole('article', { name: planNames[plan][locale === 'ja' ? 1 : 0], exact: true });
 const choose = card.getByRole('button'); await choose.focus(); await page.keyboard.press('Space');
 await expect(choose).toHaveAttribute('aria-pressed', 'true');
 expect(state.writes).toHaveLength(0);
 if (plan === 'phone_square') await page.screenshot({ path: testInfo.outputPath('payment-options.png'), fullPage: true });
 expect(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth + 1)).toBe(true);
 await save.evaluate(el => { el.click(); el.click(); });
 await expect.poll(() => state.writes.length).toBe(1);
 expect(state.writes[0]).toEqual({ provider: 'unknown', channel: 'online', methods: [], revision: 0, payment_plan: plan });
 expect(state.saved.processing_status).toBe('not_connected');
 await page.reload();
 const reloaded = page.getByRole('region', { name: locale === 'ja' ? '支払い方法の選び方' : 'Choose a payment approach', exact: true });
 if (plan === 'advanced_stripe') await reloaded.getByText(locale === 'ja' ? 'ほかの方法・Stripe（開発が必要） — 選択中' : 'More options · Stripe (more setup work) — selected', { exact: true }).click();
 await expect(reloaded.getByRole('article', { name: planNames[plan][locale === 'ja' ? 1 : 0], exact: true }).getByRole('button')).toHaveAttribute('aria-pressed', 'true');
});
test('nonowner sees the simple comparison without private requests or save controls', async ({ page }) => {
 const state = await fixture(page, { canConfigure: false, accountId: 901, direct: true, showAdvanced: false });
 const guide = page.getByRole('region', { name: 'Choose a payment approach', exact: true });
 await expect(guide).toBeVisible(); await expect(guide.getByRole('button')).toHaveCount(0);
 await expect(page.getByRole('button', { name: 'Save preferred option', exact: true })).toHaveCount(0);
 await expect(guide).toContainText('Which is cheapest? Not known yet.');
 expect(state.reads).toBe(0); expect(state.writes).toHaveLength(0);
});
test('uncertain preference save locks further edits until a fresh read', async ({ page }) => {
 const state = await fixture(page, { showAdvanced: false });
 const guide = page.getByRole('region', { name: 'Choose a payment approach', exact: true });
 await guide.getByRole('article', { name: planNames.phone_square[0], exact: true }).getByRole('button').click();
 state.writeStatus = 409;
 await page.getByRole('button', { name: 'Save preferred option', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('Save could not be confirmed');
 await expect(page.getByRole('button', { name: 'Save preferred option', exact: true })).toBeDisabled();
 await expect(guide.getByRole('article', { name: planNames.current_jms[0], exact: true }).getByRole('button')).toBeDisabled();
 expect(state.writes).toHaveLength(1);
});

for (const width of [320, 1280]) for (const theme of ['dark', 'light']) test(`simple Japanese comparison layout, ${width}px, ${theme}`, async ({ page }, testInfo) => {
 await page.setViewportSize({ width, height: 844 });
 const state = await fixture(page, { showAdvanced: false });
 await page.evaluate(theme => { localStorage.setItem('barticket_locale', 'ja'); dispatchEvent(new Event('barticket-locale')); document.documentElement.classList.toggle('light', theme === 'light'); }, theme);
 const guide = page.getByRole('region', { name: '支払い方法の選び方', exact: true });
 await expect(guide.getByRole('button')).toHaveCount(3);
 await expect(page.getByRole('combobox', { name: '現在または検討中の決済会社', exact: true })).not.toBeVisible();
 expect(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth + 1)).toBe(true);
 expect(await guide.evaluate(el => [...el.querySelectorAll('article')].filter(node => node.getBoundingClientRect().width > 0).every(node => node.getBoundingClientRect().right <= innerWidth))).toBe(true);
 await page.screenshot({ path: testInfo.outputPath(`payment-options-${theme}-${width}.png`), fullPage: true });
 expect(state.writes).toHaveLength(0);
});
