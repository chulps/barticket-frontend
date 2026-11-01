import { test, expect } from "@playwright/test";

const MOCK_ORIGIN = "http://127.0.0.1:8765";
const account = { id: 7, name: "Test Bartender", email: "test@example.invalid",
  role: "manager", has_password: true, google_connected: false };
// Operational fixtures run at 21:00 JST, outside the separate 11:30 shift-review flow.
// Keep browser Date and mock API timestamps aligned; browser timers remain real.
const FIXTURE_NOW_MS = Date.parse("2026-10-31T12:00:00Z");
const now = () => Math.floor(FIXTURE_NOW_MS / 1000);
function dayJst() {
  const shifted = new Date(FIXTURE_NOW_MS + 9 * 3600_000 - 12 * 3600_000);
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
function dateOffset(amount) {
  return new Date(Date.parse(dayJst() + "T00:00:00Z") + amount * 86_400_000).toISOString().slice(0, 10);
}
function schedule(id, date, state, actual = false) {
  return { id, business_date: date, schedule_state: state, actual_shift_exists: actual,
    manager: {name:"Test Bartender",user_id:7}, staff:[{name:"Haruka",user_id:null}],
    event_value:"Maintenance", hours:null, provenance:[{source_file:"November 2026 Daily Reports.csv",
      source_row:5, imported_by:"Test Bartender", imported_at:new Date(FIXTURE_NOW_MS).toISOString(), uncertainty:"Hours are blank in source"}] };
}
async function mockedPOS(page, { authenticated = true, locale = "en", role = "manager", noticeCount = 0, onShift = true } = {}) {
  await page.clock.setFixedTime(new Date(FIXTURE_NOW_MS));
  const state = { tickets:[ticket()], requests:[], requestUrls:[], paymentPosts:0,
    newTicketPosts:0, delayTicketCreate:false, itemPosts:0, failNextItem:false, failItemAt:0, failNextPayment:false,
    analyticsReads:0, delayAnalyticsReads:false, analyticsShifts:[], failShiftLookup:false,
    currentShift:shift(), venueStatus:{business_date:dayJst(),status:"open",event_value:null,updated_by:null,updated_at:null},
    activeMenu:structuredClone(menu), archivedItems:[], editedMenuItems:0, archivedChanges:0,
    schedules:[schedule(1,dateOffset(1),"upcoming"),schedule(2,dateOffset(-1),"past",false)] };
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
    if(method==="OPTIONS") {
      await route.fulfill({status:204,headers:{
        "Access-Control-Allow-Origin":"*",
        "Access-Control-Allow-Methods":"GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers":"*",
      }});
      return;
    }
    state.requests.push(key);
    state.requestUrls.push(req.url());
    let status=200, response=null;
    const json=() => { try { return req.postDataJSON() ?? {}; } catch { return {}; } };
    if(key==="GET /auth/status") response={has_accounts:true,google_enabled:false};
    else if(key==="GET /auth/me") {
      status=authenticated ? 200 : 401;
      response=authenticated ? {...account, role} : {detail:"Unauthorized"};
    } else if(key==="POST /auth/login") {
      status=401; response={detail:"Invalid test login"};
    } else if(key==="GET /shifts/current") {
      if(state.failShiftLookup){status=503;response={detail:"Simulated unavailable shift status"};}
      else response=onShift ? state.currentShift : null;
    }
    else if(key==="GET /venue-status") response=state.venueStatus;
    else if(key==="GET /schedules") response=state.schedules;
    else if(key==="PUT /venue-status") {
      state.venueStatus={...state.venueStatus,...json(),updated_by:account.name,updated_at:new Date(FIXTURE_NOW_MS).toISOString()};
      response=state.venueStatus;
    }
    else if(key==="GET /menu") response=state.activeMenu;
    else if(key==="GET /menu/archived") {
      status=authenticated ? 200 : 401;
      response=authenticated ? {items:state.archivedItems} : {detail:"Sign in"};
    } else if(/^PATCH \/menu\/items\/\d+$/.test(key)) {
      const itemId=Number(path.split("/").at(-1));
      const row=state.activeMenu.items.find(x=>x.id===itemId);
      if(!authenticated){status=401;response={detail:"Sign in"};}
      else if(!row){status=404;response={detail:"Unknown item"};}
      else{
        const data=json();
        state.editedMenuItems++;
        Object.assign(row,{
          name:data.name,category:data.category,subcategory:data.subcategory,
          brand:data.brand,volume:data.volume,description:data.description,
          notes:data.notes,tags:data.tags,prices:data.prices,
          inStock:data.in_stock,cocktailIngredient:data.cocktail_ingredient,
        });
        response=structuredClone(row);
      }
    } else if(/^POST \/menu\/items\/\d+\/(archive|restore)$/.test(key)) {
      const id=Number(path.split("/")[3]),archive=path.endsWith("/archive");
      const src=archive ? state.activeMenu.items : state.archivedItems;
      const dst=archive ? state.archivedItems : state.activeMenu.items;
      const index=src.findIndex(x=>x.id===id);
      if(!authenticated){status=401;response={detail:"Sign in"};}
      else if(index<0){status=404;response={detail:"Unknown item"};}
      else{
        const row=src.splice(index,1)[0];
        row.archived=archive;
        dst.push(row);
        state.archivedChanges++;
        response=structuredClone(row);
      }
    }
    else if(key==="GET /tickets") response=state.tickets;
    else if(key==="GET /users") response=[account];
    else if(key==="GET /users/recipients") response=[{id:7,name:account.name}];
    else if(key==="GET /profile/work-history") response={user_id:7,coverage:{hours_source:"clock_punches_only",historical_hours:"not_imported",staff_drink_attribution:"verified_staff_id_only",unattributed_staff_drinks:"excluded_pending_review",compensation:"not_available"},shifts:[]};
    else if(key==="GET /analytics/shift-index") response=state.analyticsShifts.map(({id,business_date,status})=>({id,business_date,status}));
    else if(key==="GET /analytics/shifts") {
      state.analyticsReads++;
      if(state.delayAnalyticsReads) await new Promise(resolve=>setTimeout(resolve,500));
      response=state.analyticsShifts;
    }
    else if(key==="GET /notices") response={notices:Array.from({length:noticeCount}, (_, i) => ({id:i+1,menu_item_id:1,item:"Highball",at:now(),by:"Test"}))};
    else if(key==="POST /tickets"){
      state.newTicketPosts++;
      if(state.delayTicketCreate) await new Promise(resolve=>setTimeout(resolve,700));
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
          if(state.failNextItem || state.itemPosts === state.failItemAt){state.failNextItem=false;status=503;response={detail:"Simulated partial failure"};}
          else{
            const data=json(), menuItem=menu.items.find(i=>i.id===data.menu_item_id);
            const quantity=data.quantity ?? 1, price=menuItem?.prices?.standard ?? 0;
            found.items.push(item(100+state.itemPosts,menuItem?.name ?? "Unknown",price,quantity));
            found.total+=quantity*price;response=found;
          }
        } else if(method==="PATCH" && m[2]==="cover"){
          const data=json();
          state.coverPatchCount=(state.coverPatchCount ?? 0)+1;
          const waived=data.waived_cover_count ?? 0;
          const returning=data.returning_guest_count ?? 0;
          if(!data.reason?.trim() || returning+waived>found.guest_count ||
            (returning>0 && !data.returning_from_ticket_id)){
            status=422; response={detail:"Invalid cover adjustment"};
          }else{
            found.waived_cover_count=waived;
            found.returning_guest_count=returning;
            found.returning_from_ticket_id=data.returning_from_ticket_id;
            found.cover_adjustment_reason=data.reason;
            found.cover_charge_total=(found.guest_count-waived-returning)*found.cover_charge_per_person;
            found.total=found.items.reduce((sum,x)=>sum+x.subtotal,0)+found.cover_charge_total;
            found.amount_paid=found.amount_paid ?? 0;
            found.balance_due=Math.max(0,found.total-found.amount_paid);
            response=found;
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
    // `null` is the valid response for a day with no open shift.
    if(response===null && !(key==="GET /shifts/current" && !state.failShiftLookup)){
      status=404;response={detail:"Unmocked API endpoint: "+key};
    }
    await route.fulfill({status,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"*",
        "Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Headers":"*"},
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
  await page.getByLabel(/Email/i).fill("nobody@example.invalid");
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
  await dialog.getByRole("button",{name:/Safely retry same collection/i}).click();
  await expect.poll(()=>state.tickets[0].status).toBe("paid");
  await page.keyboard.press("Escape");
  await page.getByRole("button",{name:"Paid"}).click();
  await expect(page.getByRole("button",{name:/Reopen Ticket/i})).toBeVisible();
  await page.getByRole("button",{name:/Reopen Ticket/i}).click();
  await page.getByRole("dialog").getByRole("button",{name:/Customer returned/i}).click();
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
  const close=page.getByRole("button",{name:/チケットを閉じる/});
  await expect(close).toBeVisible();
  await close.click();
  await expect(page.getByRole("button",{name:/会計/}).first()).toBeVisible();
});

test("Japanese add-item controls expose localized names and failure guidance",async ({page})=>{
  const state=await mockedPOS(page,{locale:"ja"});
  await page.goto("/tickets");
  state.delayTicketCreate=true;
  await page.getByRole("button",{name:"新規伝票"}).click();
  await expect(page.getByText("伝票を作成中…",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:/新規伝票/})).toBeVisible();
  state.delayTicketCreate=false;
  await page.getByRole("button",{name:"商品を追加"}).click();
  const dialog=page.getByRole("dialog");
  await dialog.getByRole("button",{name:/Highball.*¥700/}).first().click();
  await expect(dialog.getByRole("button",{name:/Highball.*数量を減らす/})).toBeVisible();
  await expect(dialog.getByRole("button",{name:/Highball.*数量を増やす/})).toBeVisible();
  state.failNextItem=true;
  await dialog.getByRole("button",{name:/保存/}).click();
  await expect(dialog.getByRole("alert")).toContainText("未確認");
});


test("item price Save commits only on explicit confirmation; Escape cancels",async ({page})=>{
  const state=await mockedPOS(page);
  await openTicket(page);
  await page.getByRole("button",{name:/Adjust price for Highball/i}).click();
  const amount=page.getByRole("textbox",{name:/New price for Highball/i});
  await amount.fill("950");
  await amount.press("Escape");
  expect(state.tickets[0].items[0].unit_price).toBe(700);
  await page.getByRole("button",{name:/Adjust price for Highball/i}).click();
  await page.getByRole("textbox",{name:/New price for Highball/i}).fill("950");
  await page.getByRole("button",{name:"Save",exact:true}).click();
  await expect.poll(()=>state.tickets[0].items[0].unit_price).toBe(950);
});

test("partial multi-item failure leaves unresolved items visible without automatic POST retry",async ({page})=>{
  const state=await mockedPOS(page);
  await openTicket(page);
  state.failItemAt=2;
  await page.getByRole("button",{name:/Add Item/i}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Regression: this click must be a real pointer hit, not force:true.
  // Earlier a sticky "All drinks" heading intercepted the price button.
  await dialog.getByRole("button",{name:/Highball.*¥700/}).first().click();
  await dialog.getByRole("button",{name:/Lemon Sour.*¥600/}).first().click();
  await dialog.getByRole("button",{name:/Save \(2\)/}).click();
  await expect.poll(()=>state.itemPosts).toBe(2);
  await expect(dialog.getByRole("alert")).toContainText(/unconfirmed/);
  expect(state.tickets[0].items.length).toBe(2);
});

test("ticket item action menu keeps original trailing-row placement and flips onscreen for last item", async ({page}) => {
  await page.setViewportSize({width:375,height:667});
  const state=await mockedPOS(page);
  // A long ticket reproduces the original offscreen menu on the final row.
  // These are historical ticket names, not live menu IDs; otherwise the
  // client correctly substitutes the catalog name for menu_item_id=3.
  const extra=Array.from({length:18},(_,n)=>({
    ...item(201+n, n===17 ? "Last Drink" : "Drink "+(n+1),700),
    menu_item_id:null,
  }));
  state.tickets[0].items.push(...extra);
  state.tickets[0].total+=extra.reduce((sum,line)=>sum+line.subtotal,0);
  await page.goto("/tickets");
  // On mobile the list opens first; tap the ticket to reveal its item details.
  await page.getByRole("button",{name:/Test Walk-in/i}).first().click();
  const trigger=page.getByRole("button",{name:"Actions for Last Drink"});
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const menu=page.getByRole("menu",{name:"Actions for Last Drink"});
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem",{name:/Adjust Price/i})).toBeVisible();
  await expect(menu.getByRole("menuitem",{name:/Remove Item/i})).toBeVisible();
  const bounds=await menu.boundingBox();
  const viewport=page.viewportSize();
  expect(bounds).toBeTruthy();
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height+1);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(viewport.width+1);
  expect(state.requests).not.toContain("PATCH /tickets/11/items/218");
  await menu.getByRole("menuitem",{name:/Adjust Price/i}).click();
  await expect(page.getByRole("textbox",{name:/New price for Last Drink/})).toBeVisible();
});

test("staff cover waiver requires only count and Save while preserving full guest attendance",async ({page})=>{
  const state=await mockedPOS(page);
  const target=state.tickets[0];
  target.guest_count=3;
  target.cover_charge_per_person=500;
  target.cover_charge_total=1500;
  target.total+=1500;
  await openTicket(page);
  const action=page.getByRole("button",{name:"Actions for Cover Charge"});
  await action.click();
  const popup=page.getByRole("menu",{name:"Actions for Cover Charge"});
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("menuitem",{name:/Waive cover charge/i})).toBeVisible();
  await popup.getByRole("menuitem",{name:/Waive cover charge/i}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("spinbutton",{name:/Covers to waive/i})).toHaveValue("1");
  await expect(dialog.getByText(/Guests: 3/)).toBeVisible();
  await dialog.getByRole("button",{name:/Save adjustment/i}).click();
  await expect.poll(()=>target.waived_cover_count).toBe(1);
  expect(state.coverPatchCount).toBe(1);
  expect(target.guest_count).toBe(3);
  expect(target.cover_charge_total).toBe(1000);
  expect(target.cover_adjustment_reason).toBe("Complimentary cover");
});

test("returning guest links same-shift paid ticket without double charging cover",async ({page})=>{
  const state=await mockedPOS(page);
  const target=state.tickets[0];
  target.guest_count=1;
  target.cover_charge_per_person=500;
  target.cover_charge_total=500;
  target.total+=500;
  const source=ticket(12);
  source.name="Paid cover source";
  source.status="paid";
  source.guest_count=1;
  source.cover_charge_per_person=500;
  source.cover_charge_total=500;
  source.total=500;
  source.items=[];
  source.amount_paid=500;
  source.balance_due=0;
  source.paid_at=now();
  source.payments=[{type:"cash",amount:500,paid_at:source.paid_at,voided_at:null}];
  source.payment={type:"cash",amount:500,paid_at:source.paid_at};
  state.tickets.push(source);
  await openTicket(page);
  await page.getByRole("button",{name:"Actions for Cover Charge"}).click();
  const popup=page.getByRole("menu",{name:"Actions for Cover Charge"});
  await popup.getByRole("menuitem",{name:/Returning customer/i}).click();
  const dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("spinbutton",{name:/Returning guests/i})).toHaveValue("1");
  await dialog.getByRole("combobox",{name:/Original paid ticket/i}).selectOption("12");
  await dialog.getByRole("button",{name:/Save adjustment/i}).click();
  await expect.poll(()=>target.returning_guest_count).toBe(1);
  expect(target.returning_from_ticket_id).toBe(12);
  expect(target.guest_count).toBe(1);
  expect(target.cover_charge_total).toBe(0);
  expect(source.amount_paid).toBe(500);
  expect(source.status).toBe("paid");
});

test("full menu edit uses the prefilled Add Item form and updates only the catalog",async ({page})=>{
  const state=await mockedPOS(page);
  const oldSnapshot=structuredClone(state.tickets[0].items[0]);
  await page.goto("/menu");
  await page.getByRole("button",{name:"Actions for Highball"}).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Edit Item", "Mark out of stock", "Archive Item"]);
  const warningColor = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--warning)";
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(page.getByRole("menuitem", { name: "Mark out of stock", exact: true })).toHaveCSS("color", warningColor);
  await page.screenshot({ path: "/tmp/barticket-menu-actions.png" });
  await page.getByRole("menuitem",{name:"Edit Item"}).click();
  const editor=page.getByRole("dialog");
  await expect(editor).toBeVisible();
  await expect(editor.getByRole("textbox",{name:/Name/i})).toHaveValue("Highball");
  await editor.getByRole("textbox",{name:/Name/i}).fill("House Highball");
  await editor.getByRole("button",{name:"Save",exact:true}).click();
  await expect.poll(()=>state.editedMenuItems).toBe(1);
  await expect(page.getByText("House Highball").first()).toBeVisible();
  expect(state.activeMenu.items.find(x=>x.id===1).name).toBe("House Highball");
  expect(state.tickets[0].items[0]).toEqual(oldSnapshot);
  expect(state.requests).toContain("PATCH /menu/items/1");
});

test("Archive Item hides a drink and Restore Item brings back the same ID with ticket history unchanged",async ({page})=>{
  const state=await mockedPOS(page);
  const before=structuredClone(state.tickets[0]);
  await page.goto("/menu");
  await page.getByRole("button",{name:"Actions for Highball"}).click();
  await page.getByRole("menuitem",{name:"Archive Item"}).click();
  const confirm=page.getByRole("dialog");
  await expect(confirm.getByText(/Existing tickets, sales and recorded prices are preserved/)).toBeVisible();
  await confirm.getByRole("button",{name:"Archive Item"}).click();
  await expect.poll(()=>state.archivedItems.length).toBe(1);
  expect(state.activeMenu.items.some(x=>x.id===1)).toBe(false);
  expect(state.tickets[0]).toEqual(before);

  await page.getByRole("button",{name:"Archived Items"}).click();
  await expect(page.getByText("Highball").first()).toBeVisible();
  page.once("dialog",dialog=>dialog.accept());
  await page.getByRole("button",{name:"Restore Item"}).click();
  await expect.poll(()=>state.archivedItems.length).toBe(0);
  await page.getByRole("button",{name:"Active Menu"}).click();
  await expect(page.getByRole("button",{name:"Actions for Highball"})).toBeVisible();
  expect(state.activeMenu.items.find(x=>x.id===1).id).toBe(1);
  expect(state.tickets[0]).toEqual(before);
  expect(state.requests).toContain("POST /menu/items/1/archive");
  expect(state.requests).toContain("POST /menu/items/1/restore");
});

test("public menu never exposes archive, restore or full edit controls",async ({page})=>{
  const state=await mockedPOS(page,{authenticated:false});
  await page.goto("/menu");
  await expect(page.getByText("Highball").first()).toBeVisible();
  await expect(page.getByRole("button",{name:"Archived Items"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Actions for Highball"})).toHaveCount(0);
  expect(state.requests).not.toContain("GET /menu/archived");
  expect(state.requests.some(key=>key.includes("PATCH /menu/items/"))).toBe(false);
});

test("Analytics coalesces focus and push bursts and fetches the newly selected report range",async ({page})=>{
  const state=await mockedPOS(page);
  state.delayAnalyticsReads=true;
  await page.goto("/analytics");
  await expect.poll(()=>state.analyticsReads).toBe(1);

  await page.evaluate(()=>{
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new Event("barticket-push"));
    window.dispatchEvent(new Event("barticket-notices"));
    window.dispatchEvent(new Event("barticket-api-restored"));
  });
  await expect.poll(()=>state.analyticsReads).toBe(2);
  await page.waitForTimeout(650);
  expect(state.analyticsReads).toBe(2);

  await page.getByRole("button",{name:"Monthly"}).click();
  await expect.poll(()=>state.analyticsReads).toBe(3);
  expect(state.requestUrls.some(url=>url.includes("/analytics/shifts?date_from=2026-10-01"))).toBe(true);
});

test("Analytics renders a repeatable 100-shift, 1000-ticket fixture responsively",async ({page})=>{
  const state=await mockedPOS(page);
  state.analyticsShifts=Array.from({length:100},(_,index)=>({
    ...shift(),
    id:100+index,
    business_date:new Date(Date.UTC(2026,0,1+index)).toISOString().slice(0,10),
    status:"closed",
    paid_total:25_000+index,
    cash_total:25_000+index,
    paid_count:10,
    cancelled_count:0,
  }));
  state.tickets=Array.from({length:1000},(_,index)=>({
    ...ticket(1000+index),
    name:`Fixture ticket ${index}`,
    status:"paid",
    shift_id:100+(index%100),
    created_at:now()-index,
    paid_at:now()-index,
    items:[item(5000+index,"Highball",700)],
  }));

  const navigationStarted=Date.now();
  await page.goto("/analytics");
  await page.getByRole("button",{name:"All time"}).waitFor();
  const navigationMs=Date.now()-navigationStarted;

  const allTimeStarted=Date.now();
  await page.getByRole("button",{name:"All time"}).click();
  await expect(page.getByRole("heading",{name:"Top 3 Selling Items"})).toBeVisible();
  await expect(page.getByText("Fixture ticket 999")).toBeVisible();
  const allTimeRenderMs=Date.now()-allTimeStarted;
  console.log(`Analytics fixture baseline: ${state.analyticsShifts.length} shifts, ${state.tickets.length} tickets; navigation ${navigationMs}ms; all-time render ${allTimeRenderMs}ms`);
  expect(navigationMs).toBeLessThan(10_000);
  expect(allTimeRenderMs).toBeLessThan(10_000);
});

test("My Time Clock renders the server punch at phone width without writing on page load",async ({page})=>{
  const state=await mockedPOS(page);
  await page.setViewportSize({width:390,height:844});
  await page.goto("/profile");
  await page.getByRole("button",{name:"Shift",exact:true}).click();

  const clock=page.getByRole("region",{name:"My time clock"});
  await expect(clock.getByRole("heading",{name:"My Time Clock"})).toBeVisible();
  await expect(clock).toContainText("Clocked in");
  await expect(clock).toContainText("Business date");
  await expect(clock).toContainText("Clocked in at");
  await expect(clock).toContainText("Recorded time");
  const clockOut=clock.getByRole("button",{name:"Clock Out"});
  await expect(clockOut).toBeEnabled();
  await expect(clockOut).toHaveCSS("min-height","44px");
  expect(state.requests).toContain("GET /shifts/current");
  expect(state.requests.filter(key=>/^POST \/shifts\/(clock-in|clock-out)$/.test(key))).toEqual([]);
  expect(await clock.evaluate(element=>element.getBoundingClientRect().right<=window.innerWidth)).toBe(true);
});

test("manager can mark venue closed while time clock remains available and POS creation is blocked",async ({page})=>{
  const state=await mockedPOS(page);
  await page.goto("/profile");
  await page.getByRole("button",{name:"Shift",exact:true}).click();
  const venue=page.getByRole("region",{name:"Venue Status"});
  await expect(venue.getByText("Venue open")).toBeVisible();
  await venue.getByLabel("Event / closure note (optional)").fill("Maintenance");
  await venue.getByRole("button",{name:"Mark venue closed today"}).click();
  await expect(venue.getByText("Venue closed")).toBeVisible();
  await expect(page.getByRole("region",{name:"My time clock"}).getByRole("button",{name:"Clock Out"})).toBeEnabled();
  expect(state.venueStatus).toMatchObject({status:"closed",event_value:"Maintenance"});

  await page.goto("/");
  await expect(page.getByText("The venue is closed today.")).toBeVisible();
  await expect(page.getByRole("button",{name:/New Ticket/i})).toBeDisabled();
  await expect(page.getByText("POS actions are unavailable while the venue is closed.")).toBeVisible();
  expect(state.newTicketPosts).toBe(0);
});

test("closure-only analytics day has zero sales while preserving maintenance hours",async ({page})=>{
  const state=await mockedPOS(page);
  state.currentShift=null;
  state.tickets=[];
  state.analyticsShifts=[{
    id:null,business_date:dayJst(),status:null,shift_status:null,venue_status:"closed",venue_event:"Maintenance",
    opened_at:null,closed_at:null,opened_by:null,closed_by:null,
    paid_total:0,cash_total:0,card_total:0,other_total:0,cover_total:0,
    guest_count:0,paid_count:0,cancelled_count:0,staff_hours:[{user_id:7,name:"Test Bartender",seconds:7200}],
    staff_drinks:[],stockouts:[],punches:[],
  }];
  await page.goto("/analytics");
  await expect(page.getByText(/Venue status Maintenance/)).toBeVisible();
  await expect(page.getByText("No shift recorded")).toBeVisible();
  await expect(page.getByText("2h 0m").first()).toBeVisible();
  await expect(page.getByText("¥0").first()).toBeVisible();
});

test("schedule page separates assigned people from actual work records and preserves source details",async ({page})=>{
  const state=await mockedPOS(page);
  await page.goto("/schedules");
  await expect(page.getByRole("heading",{name:"Shift schedule"})).toBeVisible();
  await expect(page.getByText(/Showing schedule entries from/)).toBeVisible();
  await expect(page.getByText("Scheduled",{exact:true})).toBeVisible();
  await expect(page.getByText("Past plan · no actual shift recorded")).toBeVisible();
  await expect(page.getByText("Haruka").first()).toBeVisible();
  await expect(page.getByText("Maintenance").first()).toBeVisible();
  await expect(page.getByText("November 2026 Daily Reports.csv · row 5").first()).toBeVisible();
  await expect(page.getByText("Unknown · not imported").first()).toBeVisible();
  await expect(page.getByText("Schedules never create worked time.")).toHaveCount(1);
  expect(state.requests.filter(key=>key.startsWith("GET /schedules"))).toHaveLength(1);
});

test("clock controls stay unavailable when the current shift cannot be verified",async ({page})=>{
  const state=await mockedPOS(page);
  state.failShiftLookup=true;
  await page.setViewportSize({width:390,height:844});
  await page.goto("/profile");
  await page.getByRole("button",{name:"Shift",exact:true}).click();

  const clock=page.getByRole("region",{name:"My time clock"});
  await expect(clock.getByRole("heading",{name:"My Time Clock"})).toBeVisible();
  await expect.poll(()=>state.requests.filter(key=>key==="GET /shifts/current").length).toBeGreaterThan(0);
  await expect(clock.getByRole("button",{name:/Clock In|Clock Out/})).toHaveCount(0);
  expect(state.requests.filter(key=>/^POST \/shifts\/(clock-in|clock-out)$/.test(key))).toEqual([]);
});

test("Japanese My Time Clock remains readable and tappable at phone width",async ({page})=>{
  await mockedPOS(page,{locale:"ja"});
  await page.setViewportSize({width:390,height:844});
  await page.goto("/profile");
  await page.getByRole("button",{name:"勤務",exact:true}).click();

  const clock=page.getByRole("region",{name:"自分のタイムカード"});
  await expect(clock.getByRole("heading",{name:"自分のタイムカード"})).toBeVisible();
  await expect(clock).toContainText("勤務中");
  const clockOut=clock.getByRole("button",{name:"退勤"});
  await expect(clockOut).toBeVisible();
  await expect(clockOut).toHaveCSS("min-height","44px");
});

test("mobile navigation closes on Escape and returns focus to its toggle", async ({ page }) => {
  await mockedPOS(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tickets");
  const toggle = page.getByRole("button", { name: "Navigation menu" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.getByRole("link", { name: "Analytics" }).click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();
});

test("Profile work tabs follow arrow-key selection and keep their panels connected", async ({ page }) => {
  await mockedPOS(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Work history", exact: true }).click();
  const hours = page.getByRole("tab", { name: "Hours" });
  await expect(hours).toBeVisible();
  await hours.focus();
  await page.keyboard.press("ArrowRight");
  const drinks = page.getByRole("tab", { name: "Staff drinks" });
  await expect(drinks).toBeFocused();
  await expect(drinks).toHaveAttribute("aria-selected", "true");
  await expect(drinks).toHaveAttribute("tabindex", "0");
  const panelId = await drinks.getAttribute("aria-controls");
  await expect(page.locator(`#${panelId}`)).toHaveAttribute("aria-labelledby", await drinks.getAttribute("id"));
  await page.keyboard.press("Home");
  await expect(hours).toBeFocused();
  await expect(hours).toHaveAttribute("aria-selected", "true");
});

test("Profile offers direct pay and history destinations alongside shift and account settings", async ({ page }) => {
  await mockedPOS(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Work history", exact: true }).click();
  await expect(page.getByRole("region", { name: "My work records" })).toBeVisible();
  const scales = page.getByRole("group", { name: "Time scale" });
  await expect(scales.getByRole("button", { name: "All Time" })).toHaveAttribute("aria-pressed", "true");
  await scales.getByRole("button", { name: "Monthly" }).click();
  await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
  await page.getByRole("button", { name: "My pay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Income breakdown" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My time clock" })).toHaveCount(0);
  await page.getByRole("button", { name: "Shift", exact: true }).click();
  await expect(page.getByRole("region", { name: "My time clock" })).toBeVisible();
  await page.getByRole("button", { name: "Account settings", exact: true }).click();
  await expect(page.getByRole("region", { name: "Account settings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My time clock" })).toHaveCount(0);
});

test("Profile and Admin show a verified zero shift count as zero", async ({ page }) => {
  await mockedPOS(page);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Work history", exact: true }).click();
  const personal = page.getByRole("region", { name: "My work records" });
  const personalShifts = personal.getByText("Recorded shifts").locator("..").locator("strong");
  await expect(personalShifts).toHaveText("0");

  await page.goto("/admin");
  const adminNav = page.getByRole("navigation", { name: "Admin sections" });
  await adminNav.getByRole("button", { name: "Team" }).click();
  const directory = page.getByRole("navigation", { name: "Team directory" });
  await directory.getByRole("button", { name: /Test Bartender/ }).click();
  const teamShifts = page.getByText("Shifts", { exact: true }).locator("..").locator("strong");
  await expect(teamShifts).toHaveText("0");
});

test("historical-hours reconciliation reveals each step only when it is actionable", async ({ page }) => {
  await mockedPOS(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const adminSection = page.getByRole("combobox", { name: "Admin section", exact: true });
  await expect(adminSection).toHaveValue("accounts");
  await expect(adminSection.locator('option[value="adjustments"]')).toHaveText("Pay deductions");
  expect(await adminSection.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  await adminSection.selectOption("historicalHours");

  const chooseCsv = page.getByRole("heading", { name: "Choose the staff-hours CSV" });
  const reconcile = page.getByRole("heading", { name: "Reconcile and review staff hours" });
  await expect(chooseCsv).toBeVisible();
  await expect(reconcile).toHaveCount(0);

  await page.locator('input[type="file"]').setInputFiles({
    name: "verified-hours.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Date,Staff,Hours\n2026-10-27,Haruka,6.5\n"),
  });
  await expect(reconcile).toBeVisible();
});

test("mobile picker traps focus and contains scroll; keyboard dismissal restores focus",async ({page})=>{
  const state=await mockedPOS(page);
  state.activeMenu.items=Array.from({length:24},(_,index)=>({
    id:100+index,name:`Mobile item ${index+1}`,category:"Whisky",
    prices:{standard:700+index},inStock:true,
  }));
  await openTicket(page);

  const trigger=page.getByRole("button",{name:/Add Item/i});
  await trigger.click();
  const dialog=page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.setViewportSize({width:375,height:667});
  await expect(dialog).toHaveAttribute("aria-modal","true");
  await expect.poll(()=>page.evaluate(()=>document.activeElement && document.querySelector('[role="dialog"]')?.contains(document.activeElement))).toBe(true);
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe("hidden");
  expect(await dialog.evaluate(element=>Array.from(element.querySelectorAll("div")).some(node=>
    getComputedStyle(node).overflowY==="auto" && node.scrollHeight>node.clientHeight
  ))).toBe(true);

  const first=dialog.locator("button").first();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button",{name:/¥723/})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe("");
});


for (const locale of ["en", "ja"]) {
  test("mobile notification shortcut and desktop unpaid navigation: " + locale, async ({page}) => {
    await page.setViewportSize({width:320,height:740});
    const state = await mockedPOS(page, {locale, noticeCount:120});
    await page.goto("/menu");
    const label = locale === "ja" ? "通知" : "Notifications";
    const bell = page.locator('header a[href="/notifications"]:visible');
    await expect(bell).toHaveCount(1);
    await expect(bell).toHaveAttribute("aria-label",label);
    await expect(bell).toContainText("99+");
    await expect(page.locator("header button:visible")).not.toContainText("120");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await bell.click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(bell).toHaveAttribute("aria-current","page");
    await page.setViewportSize({width:1280,height:800});
    await expect(bell).toHaveCount(1);
    await expect(bell).toHaveAttribute("aria-label",label);
    await expect(bell).toContainText("99+");
    await expect(page.locator("#desktop-more-menu")).toHaveCount(0);
    await page.getByRole("button",{name:locale === "ja" ? "その他のナビゲーション" : "More navigation options"}).click();
    const unpaid = page.locator('#desktop-more-menu a[href="/receivables"]');
    await expect(unpaid).toHaveText(locale === "ja" ? "未払い伝票" : "Unpaid tickets");
    const iconBox = await unpaid.locator("svg").boundingBox();
    expect(iconBox.width).toBeLessThan(40);
    expect(iconBox.height).toBeLessThan(40);
    await unpaid.click();
    await expect(page).toHaveURL(/\/receivables$/);
    expect(state.requests.filter(r => /^(POST|PUT|PATCH|DELETE) /.test(r))).toEqual([]);
  });
}

test("off-shift staff retain visible notifications on mobile and desktop without a zero badge",async ({page}) => {
  await page.setViewportSize({width:375,height:740});
  await mockedPOS(page, {role:"staff",onShift:false});
  await page.goto("/menu");
  await expect(page.getByRole("textbox",{name:"Search menu"})).toBeVisible();
  const bell=page.locator('header a[href="/notifications"]:visible');
  await expect(bell).toHaveCount(1);
  await expect(bell).toHaveText("");
  await bell.click();
  await expect(page.getByRole("heading",{name:"Notifications",exact:true})).toBeVisible();
  await page.setViewportSize({width:1280,height:800});
  await expect(bell).toHaveCount(1);
  await expect(bell).toHaveAttribute("aria-current","page");
  await expect(page.locator("#desktop-more-menu")).toHaveCount(0);
});

test("clocked-in staff get a bell without a zero badge",async ({page}) => {
  await page.setViewportSize({width:375,height:740});
  await mockedPOS(page, {role:"staff"});
  await page.goto("/menu");
  const bell=page.locator('header a[href="/notifications"]:visible');
  await expect(bell).toBeVisible();
  await expect(bell).toHaveText("");
});

test("Admin opens Accounts and keeps team navigation available", async ({page}) => {
  const state=await mockedPOS(page);
  await page.goto("/admin");
  const nav=page.getByRole("navigation",{name:"Admin sections"});
  await expect(nav.getByRole("button",{name:"Overview",exact:true})).toHaveCount(0);
  await expect(nav.getByRole("button",{name:"Accounts",exact:true})).toHaveAttribute("aria-pressed","true");
  await nav.getByRole("button",{name:"Team",exact:true}).click();
  await expect(page.getByRole("navigation",{name:"Team directory"})).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button",{name:"Refresh accounts",exact:true})).toBeVisible();
  expect(state.requests.filter(r=>/^(POST|PUT|PATCH|DELETE) /.test(r))).toEqual([]);
});



test("known ticket push reads only its ID; delete and unknown hint resync remain safe", async ({page}) => {
  const state=await mockedPOS(page);
  await openTicket(page);
  await expect.poll(()=>state.requestUrls.some(url=>url.includes("include_open=true")&&url.includes("shift_id=3"))).toBe(true);
  await page.waitForTimeout(500);
  const lists=state.requests.filter(x=>x==="GET /tickets").length;
  state.tickets[0].name="Targeted rename";
  await page.evaluate(()=>{
    const detail={eventType:"ticket_updated",ticketId:11};
    window.dispatchEvent(new CustomEvent("barticket-push",{detail}));
    window.dispatchEvent(new CustomEvent("barticket-push",{detail}));
  });
  await expect.poll(()=>state.requests.filter(x=>x==="GET /tickets/11").length).toBe(1);
  await expect(page.getByText("Targeted rename",{exact:true}).first()).toBeVisible();
  expect(state.requests.filter(x=>x==="GET /tickets").length).toBe(lists);
  state.tickets=[];
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent("barticket-push",{detail:{eventType:"ticket_updated",ticketId:11}})));
  await expect(page.getByText("Targeted rename",{exact:true})).toHaveCount(0);
  await page.evaluate(()=>window.dispatchEvent(new Event("barticket-push")));
  await expect.poll(()=>state.requests.filter(x=>x==="GET /tickets").length).toBeGreaterThan(lists);
  expect(state.requests.some(x=>/^(POST|PATCH|DELETE) /.test(x))).toBe(false);
});

test("Analytics fetches selected period tickets, expanding to all only on explicit All Time", async ({page}) => {
  const state=await mockedPOS(page);
  await page.goto("/analytics");
  await expect.poll(()=>state.requestUrls.some(url=>url.includes("/tickets?date_from="+dayJst())&&url.includes("date_to="+dayJst()))).toBe(true);
  expect(state.requestUrls.some(url=>url.endsWith("/tickets"))).toBe(false);
  expect(state.requestUrls.some(url=>url.endsWith("/analytics/shifts"))).toBe(false);
  expect(state.requestUrls.some(url=>url.endsWith("/analytics/shift-index"))).toBe(true);
  await page.getByRole("button",{name:"Monthly",exact:true}).click();
  await expect.poll(()=>state.requestUrls.some(url=>url.includes("/tickets?date_from=2026-10-01")&&url.includes("date_to=2026-10-31"))).toBe(true);
  await expect.poll(()=>state.requestUrls.some(url=>url.includes("/analytics/shifts?date_from=2026-10-01"))).toBe(true);
  await page.getByRole("button",{name:"Year",exact:true}).click();
  await expect.poll(()=>state.requestUrls.some(url=>url.includes("/analytics/shifts?date_from=2026-01-01")&&url.includes("date_to=2026-12-31"))).toBe(true);
  await page.getByRole("button",{name:"All time",exact:true}).click();
  await expect.poll(()=>state.requestUrls.some(url=>url.endsWith("/tickets"))).toBe(true);
  await expect.poll(()=>state.requestUrls.some(url=>url.endsWith("/analytics/shifts"))).toBe(true);
});

test("healthy occupancy clock advances locally without ticket/report traffic, then applies a guest change", async ({page}) => {
  const state=await mockedPOS(page);
  state.tickets[0].guest_count=2;
  let socket;
  await page.routeWebSocket('**/realtime/ws', peer => {
    socket=peer;
    peer.onMessage(message=>{
      if(JSON.parse(message).type==='authenticate') peer.send(JSON.stringify({type:'ready',version:1,cursor:100000}));
    });
  });
  // Install before mounting: intervals registered before installation remain native.
  await page.clock.install({time:new Date(FIXTURE_NOW_MS)});
  await page.goto('/analytics');
  const chart=page.getByTestId('guest-occupancy-chart');
  await expect(chart).toBeVisible();
  await expect(chart.locator('strong').first()).toHaveText('2');
  await expect.poll(()=>Boolean(socket)).toBe(true);
  await page.waitForTimeout(500);
  const relevant=()=>state.requests.filter(path=>['GET /tickets','GET /analytics/shifts'].includes(path)).length;
  const before=relevant();
  const heartbeat=JSON.stringify({type:'heartbeat',version:1,cursor:100000,scopes:[]});
  for(let i=0;i<16;i++){
    socket.send(heartbeat);
    await page.clock.runFor(4000);
  }
  console.log(JSON.stringify({scenario:'occupancy-clock-before-assert',browserNow:await page.evaluate(()=>Date.now()),ticketReportReads:relevant()-before}));
  await expect(chart).toContainText('21:01');
  await expect(chart.locator('strong').first()).toHaveText('2');
  expect(relevant()).toBe(before);
  state.tickets[0].guest_count=4;
  socket.send(JSON.stringify({type:'invalidate',version:1,cursor:100001,scopes:['tickets','analytics']}));
  await page.clock.runFor(500);
  await expect(chart.locator('strong').first()).toHaveText('4');
  expect(relevant()-before).toBe(2); // one scoped ticket read and one scoped report read, no duplicate fanout
  expect(state.requests.some(path=>/^(POST|PATCH|DELETE) /.test(path))).toBe(false);
  console.log(JSON.stringify({scenario:'occupancy-local-clock',stableSeconds:64,stableTicketReportReads:0,changeTicketReportReads:2,heartbeatJsonBytes:Buffer.byteLength(heartbeat)}));
});


test("previous-night payment requires explicit collection date and reason; Cancel is read-only",async ({page})=>{
  const state=await mockedPOS(page);
  state.tickets[0].service_business_date=dateOffset(-1);
  state.tickets[0].service_status="active";
  const payments=[];
  page.on("request",request=>{
    if(request.method()==="POST"&&new URL(request.url()).pathname==="/tickets/11/pay")
      payments.push({body:request.postDataJSON(),key:request.headers()["idempotency-key"]});
  });
  await openTicket(page);
  await closeStep(page);
  await page.getByRole("button",{name:/Take Payment/i}).click();
  let dialog=page.getByRole("dialog");
  await expect(dialog.getByLabel("Actual collection business date")).toHaveValue("");
  await expect(dialog.getByRole("button",{name:/Confirm Payment/i})).toBeDisabled();
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
  expect(state.paymentPosts).toBe(0);
  await page.getByRole("button",{name:/Take Payment/i}).click();
  dialog=page.getByRole("dialog");
  await dialog.getByLabel("Actual collection business date").fill(dateOffset(-1));
  await expect(dialog.getByRole("button",{name:/Confirm Payment/i})).toBeDisabled();
  await dialog.getByLabel("Confirmation reason").fill("Receipt confirms cash last night");
  state.failNextPayment=true;
  await dialog.getByRole("button",{name:/Confirm Payment/i}).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Actual collection business date")).toBeDisabled();
  await dialog.getByRole("button",{name:/Safely retry same collection/i}).click();
  await expect.poll(()=>state.tickets[0].status).toBe("paid");
  expect(payments).toHaveLength(2);
  expect(payments[0]).toEqual(payments[1]);
  expect(payments[0].key).toBeTruthy();
  expect(payments[0].body.collection_business_date).toBe(dateOffset(-1));
  expect(payments[0].body.collection_date_reason).toBe("Receipt confirms cash last night");
});

// #327: lifecycle feedback only follows confirmed local actions, never snapshots.
test('ticket action cues: create confirmation, no replay after refresh, cancellation and repeated creation', async ({page})=>{
  const state=await mockedPOS(page);
  await openTicket(page);
  const cue=page.locator('[data-ticket-action]');
  await expect(cue).toHaveCount(0);
  state.delayTicketCreate=true;
  await page.getByRole('button',{name:/New Ticket/i}).dblclick();
  await expect(cue).toHaveCount(0);
  await expect(cue).toHaveAttribute('data-ticket-action','created');
  expect(state.newTicketPosts).toBe(1);
  await expect(cue).toContainText('#13');
  expect(await cue.evaluate(el=>getComputedStyle(el).animationName)).toBe('ticket-action-create');
  expect(await cue.evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  await expect(cue).toHaveCount(0,{timeout:4000});
  await page.evaluate(()=>window.dispatchEvent(new Event('barticket-push')));
  await page.waitForTimeout(400);
  await expect(cue).toHaveCount(0);
  await closeStep(page);
  await page.getByRole('button',{name:/Cancel Ticket/i}).click();
  await page.getByRole('button',{name:'No',exact:true}).click();
  await expect(cue).toHaveCount(0);
  await page.getByRole('button',{name:/Cancel Ticket/i}).click();
  await page.getByRole('button',{name:/Yes, cancel ticket/i}).click();
  await expect(cue).toHaveAttribute('data-ticket-action','cancelled');
  expect(await cue.evaluate(el=>getComputedStyle(el).animationName)).toBe('ticket-action-cancel');
  await page.getByRole('button',{name:'Open',exact:true}).click();
  await page.getByRole('button',{name:/New Ticket/i}).click();
  await expect(cue).toHaveAttribute('data-ticket-action','created');
  await expect(cue).toContainText('#14');
});

test('ticket action cues: failed double payment is quiet, confirmed payment and reopen are distinct',async({page})=>{
  const state=await mockedPOS(page);
  await openTicket(page);await closeStep(page);
  const cue=page.locator('[data-ticket-action]');
  await page.getByRole('button',{name:/Take Payment/i}).click();
  state.failNextPayment=true;
  const dialog=page.getByRole('dialog');
  await dialog.getByRole('button',{name:/Confirm Payment/i}).dblclick();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(state.paymentPosts).toBe(1);
  await expect(cue).toHaveCount(0);
  await dialog.getByRole('button',{name:/Safely retry same collection/i}).click();
  await expect(cue).toHaveAttribute('data-ticket-action','paid');
  await expect(cue).toContainText('Ticket paid');
  expect(await cue.locator('.ticket-action-symbol').evaluate(el=>getComputedStyle(el).animationName)).toBe('ticket-action-check');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:/Reopen Ticket/i}).click();
  await page.getByRole('dialog').getByRole('button',{name:/Customer returned/i}).click();
  await expect(cue).toHaveAttribute('data-ticket-action','reopened');
  expect(await cue.evaluate(el=>getComputedStyle(el).animationName)).toBe('ticket-action-return');
  await expect(page.getByRole('button',{name:/Close ticket/i})).toBeVisible();
});

test('ticket action cues: mobile reduced motion keeps Japanese text and partial payment does not claim paid',async({page})=>{
  await page.setViewportSize({width:375,height:740});
  await page.emulateMedia({reducedMotion:'reduce'});
  const state=await mockedPOS(page,{locale:'ja'});
  await page.goto('/tickets');
  await page.getByRole('button',{name:/Test Walk-in/}).click();
  await page.getByRole('button',{name:/チケットを閉じる/}).click();
  await page.getByRole('button',{name:'会計',exact:true}).click();
  // Mock an authoritative partial response, independent of the amount submitted.
  await page.route(MOCK_ORIGIN+'/tickets/11/pay',async route=>{
    if(route.request().method()==='OPTIONS') return route.fallback();
    Object.assign(state.tickets[0],{status:'open',balance_due:200,amount_paid:500,settlement_status:'partially_paid'});
    await route.fulfill({json:state.tickets[0],headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.getByRole('dialog').getByRole('button',{name:/支払い確定|会計を確定|支払いを確定/}).click();
  const cue=page.locator('[data-ticket-action]');
  await expect(cue).toHaveAttribute('data-ticket-action','payment-recorded');
  await expect(cue).toContainText('入金を記録しました');
  expect(await cue.evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  expect(await cue.locator('.ticket-action-symbol').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:/チケットを閉じる/})).toBeVisible();
});

for(const width of [390,1280]) for(const locale of ['en','ja']) test(`dirty add-drink round survives accidental dismissal: ${locale} ${width}px`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:844});
 const state=await mockedPOS(page,{locale});
 state.activeMenu.items.push({id:4,name:'Same price whisky',category:'Whisky',prices:{'15ml':700,'30ml':900},inStock:true});
 await page.goto('/tickets');await page.getByRole('button',{name:/Test Walk-in/}).first().click();
 const trigger=page.getByRole('button',{name:locale==='ja'?'商品を追加':'Add Item',exact:true});await trigger.click();
 const dialog=page.getByRole('dialog');
 await dialog.getByRole('button',{name:/Highball.*¥700/}).click();
 const sizedDrink=dialog.getByRole('button',{name:/Same price whisky 15ml.*¥700/});
 await sizedDrink.focus();await sizedDrink.press('Enter');
 const overlay=dialog.locator('..');
 const answerDiscard=async(action,accept=false)=>{
  // Await a real confirmation for every attempted close; an unconsumed once-listener
  // must not silently dismiss a later explicit discard.
  const handled=page.waitForEvent('dialog').then(async prompt=>{
   expect(prompt.type()).toBe('confirm');
   expect(prompt.message()).toContain(locale==='ja'?'選択したドリンクを破棄':'Discard the selected drinks');
   if(accept)await prompt.accept();else await prompt.dismiss();
  });
  await Promise.all([handled,action()]);
 };
 if(width<768){
  // The phone dialog fills the viewport: (1,1) hits its content, not an exposed backdrop.
  expect(await overlay.evaluate(node=>document.elementFromPoint(1,1)===node)).toBe(false);
 }
 const attemptBackdrop=()=>width<768
  ? overlay.dispatchEvent('click') // Guard contract only; no reachable phone backdrop is claimed.
  : overlay.click({position:{x:1,y:1}}); // Real pointer dismissal on desktop.
 for(const dismiss of [()=>page.keyboard.press('Escape'),()=>dialog.locator('button').first().click(),attemptBackdrop]){
  await answerDiscard(dismiss);await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:locale==='ja'?/Highball.*数量を増やす/:/Increase quantity of Highball/})).toBeVisible();
 }
 expect(state.itemPosts).toBe(0);
 await page.screenshot({path:testInfo.outputPath(`audit-dirty-discard-retained-${locale}-${width}.png`)});
 await answerDiscard(()=>page.keyboard.press('Escape'),true);await expect(dialog).toHaveCount(0);await expect(trigger).toBeFocused();
 await trigger.click();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});


for(const width of [390,1280]) for(const locale of ['en','ja']) test(`checkout pending dismissal and uncertain reopen preserve exact intent through settled replay: ${locale} ${width}px`,async({page},testInfo)=>{
 const ja=locale==='ja';await page.setViewportSize({width,height:844});
 const state=await mockedPOS(page,{locale});const requests=[];let release,collections=0;
 const firstResponse=new Promise(resolve=>{release=resolve;});
 await page.route(MOCK_ORIGIN+'/tickets/11/pay',async route=>{
  const req=route.request();if(req.method()==='OPTIONS')return route.fallback();
  const headers={'Access-Control-Allow-Origin':'*'};
  requests.push({body:req.postDataJSON(),key:req.headers()['idempotency-key']});
  if(requests.length===1){
   await firstResponse;
   return route.fulfill({status:503,json:{detail:'Fixture uncertain response before collection'},headers});
  }
  if(requests.length===2){
   collections++;
   Object.assign(state.tickets[0],{status:'paid',balance_due:0,amount_paid:700,settlement_status:'settled',paid_at:now(),payment:{type:req.postDataJSON().method,amount:700,paid_at:now()}});
   return route.fulfill({status:503,json:{detail:'Fixture response lost after collection'},headers});
  }
  // The backend's replay precedes closed-ticket validation; no second collection.
  expect(requests.at(-1)).toEqual(requests[0]);
  return route.fulfill({json:state.tickets[0],headers});
 });
 await page.goto('/tickets');
 if(width<769)await page.getByRole('button',{name:/Test Walk-in/}).first().click();
 const reopenPayment=async()=>{
  await page.getByRole('button',{name:ja?'チケットを閉じる':'Close ticket',exact:true}).click();
  await page.getByRole('button',{name:ja?'会計':'Take Payment',exact:true}).click();
  return page.getByRole('dialog');
 };
 let dialog=await reopenPayment();await dialog.locator('button').last().click();
 await expect.poll(()=>requests.length).toBe(1);
 await dialog.locator('button').first().click();await expect(dialog).toBeVisible();
 await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
 await dialog.locator('..').click({position:{x:1,y:1}});await expect(dialog).toBeVisible();
 expect(requests).toHaveLength(1);release();await expect(dialog.getByRole('alert')).toBeVisible();
 await expect(dialog.locator('button').last()).toBeEnabled();
 await expect(dialog.locator('button').last()).toHaveCSS('filter','none');
 await expect(dialog.locator('button').last()).toHaveCSS('opacity','1');
 await page.screenshot({path:testInfo.outputPath(`audit-checkout-uncertain-${locale}-${width}.png`)});
 page.once('dialog',d=>d.dismiss());await page.keyboard.press('Escape');await expect(dialog).toBeVisible();
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:ja?'閉じて伝票を確認':'Close and check ticket',exact:true}).click();
 await expect(dialog).toHaveCount(0);
 dialog=await reopenPayment();await dialog.locator('button').last().click();
 await expect(dialog.getByRole('alert')).toBeVisible();expect(state.tickets[0].status).toBe('paid');
 await dialog.locator('button').last().click();
 await expect(dialog.getByRole('heading',{name:ja?'入金を記録しました':'Payment recorded'})).toBeVisible();
 await expect(dialog.getByRole('status')).toContainText('¥0');
 await expect(dialog.getByText(ja?'全額お支払い済み':'Fully settled',{exact:true})).toBeVisible();
 await page.screenshot({path:testInfo.outputPath(`audit-checkout-settled-replay-${locale}-${width}.png`)});
 expect(collections).toBe(1);expect(requests).toHaveLength(3);
 expect(requests[1]).toEqual(requests[0]);expect(requests[2]).toEqual(requests[0]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
