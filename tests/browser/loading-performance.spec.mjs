import { test, expect } from "@playwright/test";
const baseline = process.env.PERFORMANCE_BASELINE === "1";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(page) {
  const state = { calls: [], denial: false, offline: false, delay: 300, role: "manager" };
  await page.addInitScript(() => {
    localStorage.setItem("barticket_token","PERFORMANCE_TEST_A");
    localStorage.setItem("barticket_locale","en");
  });
  await page.route("**/*",route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.route("http://127.0.0.1:8765/**",async route => {
    const req=route.request(), path=new URL(req.url()).pathname;
    if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,OPTIONS"}});
    state.calls.push({path,at:Date.now(),method:req.method()});
    const auth=req.headers().authorization;
    const person={id:auth?.endsWith("_B")?8:7,name:auth?.endsWith("_B")?"Other Person":"Performance Manager",email:"performance@example.invalid",
      role:state.role,has_password:true,google_connected:false};
    if(["/auth/me","/users","/shifts/current"].includes(path))await wait(state.delay);
    if(state.offline && path==="/auth/me") return route.abort();
    let status=200,body={};
    if(path==="/auth/me"){status=state.denial?403:200;body=state.denial?{detail:"Access revoked"}:person;}
    else if(path==="/users")body=[person];
    else if(path==="/menu")body={coverCharge:500,items:[]};
    else if(path==="/shifts/current")body=null;
    else if(path==="/auth/status")body={has_accounts:true,google_enabled:false};
    else if(path==="/profile/work-history")body={user_id:person.id,shifts:[]};
    else if(path==="/notices")body={notices:[]};
    else if(path==="/analytics/shifts")body=[];
    else if(path==="/push/status")body={enabled:false};
    else if(path==="/realtime/events")body={cursor:0,scopes:[]};
    else {status=404;body={detail:"No fixture for "+path};}
    await route.fulfill({status,json:body,headers:{"Access-Control-Allow-Origin":"*"}});
  });
  return state;
}

test("delayed cold Admin entry coalesces authentication and keeps a stable loading shell",async({page})=>{
  const state=await fixture(page);
  await page.goto("/admin");
  if(!baseline)await expect(page.locator('header a[href="/tickets"]:visible')).toBeVisible();
  await expect(page.getByRole("button",{name:"Review team and pay",exact:true})).toBeVisible();
  const auth=state.calls.filter(x=>x.path==="/auth/me");
  const users=state.calls.find(x=>x.path==="/users");
  const shift=state.calls.find(x=>x.path==="/shifts/current");
  const measured=Date.now()-auth[0].at;
  console.log(JSON.stringify({scenario:baseline?"baseline":"improved",delayMs:state.delay,authReads:auth.length,
    authToUsersMs:users.at-auth[0].at,authToShiftMs:shift.at-auth[0].at,readyMs:measured}));
  if(baseline) expect(auth.length).toBeGreaterThanOrEqual(3);
  else expect(auth.length).toBe(1);
  if(!baseline){
    // Request count is deterministic; timings also include lazy module compilation.
    expect(Math.abs(shift.at-auth[0].at)).toBeLessThan(1000);
  }
  expect(state.calls.filter(x=>x.method!=="GET")).toEqual([]);
});

test("same-session focus retains the selected Admin screen, but revoked access clears it",async({page})=>{
  test.skip(baseline);
  const state=await fixture(page);
  await page.goto("/admin");
  await page.getByRole("navigation",{name:"Admin sections"}).getByRole("button",{name:"Accounts",exact:true}).click();
  await expect(page.getByRole("button",{name:"Refresh accounts",exact:true})).toBeVisible();
  const before=state.calls.filter(x=>x.path==="/auth/me").length;
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Checking for updates…",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Refresh accounts",exact:true})).toBeVisible();
  await expect(page.getByText("Checking for updates…",{exact:true})).toHaveCount(0);
  expect(state.calls.filter(x=>x.path==="/auth/me")).toHaveLength(before+1);
  state.offline=true;
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button",{name:"Refresh accounts",exact:true})).toBeVisible();
  state.offline=false;state.denial=true;
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Access revoked",{exact:true}).or(page.getByRole("heading",{name:"Sign in",exact:true}))).toBeVisible();
  await expect(page.getByRole("button",{name:"Refresh accounts",exact:true})).toHaveCount(0);
});

test("account switches cannot expose a previous manager snapshot or pending refresh",async({page})=>{
  test.skip(baseline);
  const state=await fixture(page);
  await page.goto("/admin");
  await expect(page.getByRole("button",{name:"Review team and pay",exact:true})).toBeVisible();
  state.delay=600;
  await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  state.role="staff";
  await page.evaluate(()=>{
    localStorage.setItem("barticket_token","PERFORMANCE_TEST_B");
    window.dispatchEvent(new Event("barticket-auth"));
  });
  await expect(page.getByRole("button",{name:"Review team and pay",exact:true})).toHaveCount(0);
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator('header a[href="/admin"]:visible')).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Review team and pay",exact:true})).toHaveCount(0);
});

test("warm Profile and Admin transitions do not fan out authentication reads",async({page})=>{
  test.skip(baseline);
  const state=await fixture(page);
  await page.goto("/admin");
  await expect(page.getByRole("button",{name:"Review team and pay",exact:true})).toBeVisible();
  const before=state.calls.filter(x=>x.path==="/auth/me").length;
  const started=Date.now();
  await page.getByRole("button",{name:"More navigation options"}).click();
  await page.locator('#desktop-more-menu a[href="/profile"]').click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect.poll(()=>state.calls.filter(x=>x.path==="/profile/work-history").length).toBeGreaterThan(0);
  const profileMs=Date.now()-started;
  expect(state.calls.filter(x=>x.path==="/auth/me").length-before).toBeLessThanOrEqual(1);
  await page.getByRole("button",{name:"More navigation options"}).click();
  await page.locator('#desktop-more-menu a[href="/admin"]').click();
  await expect(page.getByRole("button",{name:"Review team and pay",exact:true})).toBeVisible();
  console.log(JSON.stringify({scenario:"warm-transitions",profileMs,totalMs:Date.now()-started,
    authReads:state.calls.filter(x=>x.path==="/auth/me").length-before}));
  expect(state.calls.filter(x=>x.path==="/auth/me").length-before).toBeLessThanOrEqual(2);
  expect(state.calls.filter(x=>x.method!=="GET")).toEqual([]);
});
