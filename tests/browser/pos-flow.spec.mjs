import { test, expect } from "@playwright/test";

const MOCK_ORIGIN = "http://127.0.0.1:8765";
const account = { id: 7, name: "Test Bartender", email: "test@example.invalid",
  role: "manager", has_password: true, google_connected: false };
const now = () => Math.floor(Date.now() / 1000);
function dayJst() {
  const shifted = new Date(Date.now() + 9 * 3600_000 - 12 * 3600_000);
  return shifted.toISOString().slice(0, 10);
}
const item = (id, name, price, quantity = 1) => ({
  id, menu_item_id: id === 31 ? 1 : id === 32 ? 2 : 3,
  name, price_key: "standard", quantity, unit_price: price, subtotal: price * quantity,
});
function ticket(id = 11) {
  return { id, name: "Test Walk-in", status: "open",
    items: [item(31, "Highball", 700)], guest_count: 0,
    cover_charge_per_person: 0, cover_charge_total: 0, total: 700,
    created_at: now(), paid_at: null, cancelled_at: null, created_by: "Test Bartender",
    shift_id: 3, payment: null };
}
function shift() {
  return { id: 3, business_date: dayJst(), status: "open",
    opened_at: now() - 1000, closed_at: null, opened_by: "Test Bartender", closed_by: null,
    paid_total: 0, cash_total: 0, card_total: 0, other_total: 0, cover_total: 0,
    guest_count: 0, paid_count: 0, cancelled_count: 0, staff_hours: [],
    punches: [{user_id:7,name:"Test Bartender",clock_in:now()-500,clock_out:null}] };
}
const menu = {
  coverCharge: 0,
  items: [
    { id:1, name:"Highball", category:"Whisky", prices:{standard:700}, inStock:true },
    { id:2, name:"Lemon Sour", category:"Cocktails", prices:{standard:600}, inStock:true },
    { id:3, name:"Oolong Hai", category:"Cocktails", prices:{standard:550}, inStock:true },
  ],
};
async function mockedPOS(page, { authenticated = true, locale = "en" } = {}) {
  const state = { tickets:[ticket()], requests:[], paymentPosts:0,
    newTicketPosts:0, itemPosts:0, failNextItem:false, failNextPayment:false };
  await page.addInitScript(({authenticated, locale}) => {
    if(authenticated) localStorage.setItem("barticket_token","NON_PRODUCTION_BROWSER_TEST_TOKEN");
    else localStorage.removeItem("barticket_token");
    localStorage.setItem("barticket_locale",locale);
  }, { authenticated, locale });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    // Deny all third-party network requests; test never follows real payment links.
    if (url.hostname !== "127.0.0.1") return route.abort();
    return route.continue();
  });
  await page.route(MOCK_ORIGIN + "/**", async route => {
    const req=route.request();
    const path=new URL(req.url()).pathname;
    const method=req.method();
    const key=method+" "+path;
    state.requests.push(key);
    let status=200, response=null;
    const json=() => { try { return req.postDataJSON() ?? {}; } catch { return {}; } };
    if(key==="GET /auth/status") response={has_accounts:true,google_enabled:false};
    else if(key==="GET /auth/me") {
      status=authenticated ? 200 : 401;
      response=authenticated ? account : {detail:"Unauthorized"};
    } else if(key==="POST /auth/login") {
      status=401; response={detail:"Invalid test login"};
    } else if(key==="GET /shifts/current") response=shift();
    else if(key==="GET /menu") response=menu;
    else if(key==="GET /tickets") response=state.tickets;
    else if(key==="GET /users") response=[account];
    else if(key==="GET /users/recipients") response=[{id:7,name:account.name}];
    else if(key==="GET /analytics/shifts") response=[];
    else if(key==="GET /notices") response={notices:[]};
    else if(key==="POST /tickets"){
      state.newTicketPosts++;
      const created=ticket(12+state.newTicketPosts);
      created.name="New walk-in";
      created.items=[];
      created.total=0;
      state.tickets.unshift(created);
      response=created;
    } else {
      const m=path.match(/^\/tickets\/(\d+)(?:\/(.*))?$/);
      if(m) {
        const found=state.tickets.find(t=>t.id===Number(m[1]));
        if(!found){status=404;response={detail:"Unknown mock ticket"};}
        else if(method==="GET")response=found;
        else if(method==="POST" && m[2]==="items"){
          state.itemPosts++;
          if(state.failNextItem){state.failNextItem=false;status=503;response={detail:"Simulated partial failure"};}
          else{
            const data=json(), menuItem=menu.items.find(i=>i.id===data.menu_item_id);
            const quantity=data.quantity ?? 1, price=menuItem?.prices?.standard ?? 0;
            found.items.push(item(30+state.itemPosts,menuItem?.name ?? "Unknown",price,quantity));
            found.total+=quantity*price;response=found;
          }
        } else if(method==="PATCH" && m[2]?.startsWith("items/")){
          const line=found.items.find(x=>x.id===Number(m[2].split("/")[1]));
          if(!line){status=404;response={detail:"Missing line"};}
          else {
            const data=json();
            if(data.unit_price!==undefined)line.unit_price=data.unit_price;
            if(data.quantity!==undefined)line.quantity=data.quantity;
            line.subtotal=line.quantity*line.unit_price;
            found.total=found.items.reduce((sum,x)=>sum+x.subtotal,0);
            response=found;
          }
        } else if(method==="PATCH" && !m[2]){found.name=json().name;response=found;}
        else if(method==="POST" && m[2]==="cancel"){
          found.status="cancelled";found.cancelled_at=now();response=found;
        } else if(method==="POST" && m[2]==="pay"){
          state.paymentPosts++;
          // Delay so a rapid second click can be made while the first is pending.
          await new Promise(resolve=>setTimeout(resolve,200));
          if(state.failNextPayment){state.failNextPayment=false;status=409;response={detail:"Mock payment conflict"};}
          else{
            found.status="paid";found.paid_at=now();
            found.payment={type:json().method,amount:found.total,paid_at:now()};
            response=found;
          }
        } else if(method==="POST" && m[2]==="reopen"){
          found.status="open";found.payment=null;found.paid_at=null;response=found;
        }
      }
    }
    if(response===null){status=404;response={detail:"Unmocked API endpoint: "+key};}
    await route.fulfill({status,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*"},
      body:JSON.stringify(response)});
  });
  return state;
}
async function openTicket(page) {
  await page.goto("/tickets");
  await expect(page.getByRole("button",{name:/Close ticket/i})).toBeVisible();
}
async function closeStep(page){
  await page.getByRole("button",{name:/Close ticket/i}).click();
  await expect(page.getByRole("button",{name:/Take Payment/i})).toBeVisible();
}

test("unauthenticated status and failed login never expose a ticket board",async ({page})=>{
  const state=await mockedPOS(page,{authenticated:false});
  await page.goto("/");
  await expect(page.getByRole("button",{name:/Sign In/i})).toBeVisible();
  await page.locator('input[type="email"]').fill("nobody@example.invalid");
  await page.locator('input[type="password"]').fill("wrong");
  await page.getByRole("button",{name:/Sign In/i}).click();
  await expect(page.getByRole("alert")).toContainText("Invalid test login");
  expect(state.requests).not.toContain("POST /tickets");
});

test("create ticket is a single POST even on rapid double activation",async ({page})=>{
  const state=await mockedPOS(page);
  await openTicket(page);
  const create=page.getByRole("button",{name:/New Ticket/i});
  await create.dblclick();
  await expect.poll(()=>state.newTicketPosts).toBe(1);
  await expect(page.getByText("#13").first()).toBeVisible();
});

test("close stage, cancel confirmation and Back do not write until confirmed",async ({page})=>{
  const state=await mockedPOS(page);
  await openTicket(page);
  await closeStep(page);
  await page.getByRole("button",{name:/Back/i}).last().click();
  await expect(page.getByRole("button",{name:/Close ticket/i})).toBeVisible();
  await closeStep(page);
  await page.getByRole("button",{name:/Cancel Ticket/i}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button",{name:"No",exact:true}).click();
  expect(state.tickets[0].status).toBe("open");
  await page.getByRole("button",{name:/Cancel Ticket/i}).click();
  await page.getByRole("button",{name:/Yes, cancel ticket/i}).click();
  await expect.poll(()=>state.tickets[0].status).toBe("cancelled");
});

test("payment conflict displays an error without duplicate POST, then paid/reopen succeeds",async ({page})=>{
  const state=await mockedPOS(page);
  await openTicket(page);
  await closeStep(page);
  await page.getByRole("button",{name:/Take Payment/i}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  state.failNextPayment=true;
  const confirm=dialog.getByRole("button",{name:/Confirm Payment/i});
  await confirm.dblclick();
  await expect.poll(()=>state.paymentPosts).toBe(1);
  await expect(dialog.getByRole("alert")).toBeVisible();
  await confirm.click();
  await expect.poll(()=>state.tickets[0].status).toBe("paid");
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Paid"}).click();
  await expect(page.getByRole("button",{name:/Reopen Ticket/i})).toBeVisible();
  await page.getByRole("button",{name:/Reopen Ticket/i}).click();
  await expect.poll(()=>state.tickets[0].status).toBe("open");
});

test("mobile menu search stays visible with long lists, and Japanese close navigation works",async ({page})=>{
  await page.setViewportSize({width:375,height:667});
  await mockedPOS(page,{locale:"ja"});
  await page.goto("/menu");
  const search=page.getByPlaceholder(/検索/);
  await expect(search).toBeVisible();
  await search.fill("Highball");
  await expect(page.getByText("Highball").first()).toBeVisible();
  await page.goto("/tickets");
  await page.getByRole("button",{name:/Test Walk-in/i}).first().click();
  const close=page.getByRole("button",{name:/チケットを閉じる/);
  await expect(close).toBeVisible();
  await close.click();
  await expect(page.getByRole("button",{name:/支払い|お支払い/}).first()).toBeVisible();
});
