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
function dateOffset(amount) {
  return new Date(Date.parse(dayJst() + "T00:00:00Z") + amount * 86_400_000).toISOString().slice(0, 10);
}
function schedule(id, date, state, actual = false) {
  return { id, business_date: date, schedule_state: state, actual_shift_exists: actual,
    manager: {name:"Test Bartender",user_id:7}, staff:[{name:"Haruka",user_id:null}],
    event_value:"Maintenance", hours:null, provenance:[{source_file:"November 2026 Daily Reports.csv",
      source_row:5, imported_by:"Test Bartender", imported_at:new Date().toISOString(), uncertainty:"Hours are blank in source"}] };
}
async function mockedPOS(page, { authenticated = true, locale = "en" } = {}) {
  const state = { tickets:[ticket()], requests:[], paymentPosts:0,
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
    let status=200, response=null;
    const json=() => { try { return req.postDataJSON() ?? {}; } catch { return {}; } };
    if(key==="GET /auth/status") response={has_accounts:true,google_enabled:false};
    else if(key==="GET /auth/me") {
      status=authenticated ? 200 : 401;
      response=authenticated ? account : {detail:"Unauthorized"};
    } else if(key==="POST /auth/login") {
      status=401; response={detail:"Invalid test login"};
    } else if(key==="GET /shifts/current") {
      if(state.failShiftLookup){status=503;response={detail:"Simulated unavailable shift status"};}
      else response=state.currentShift;
    }
    else if(key==="GET /venue-status") response=state.venueStatus;
    else if(key==="GET /schedules") response=state.schedules;
    else if(key==="PUT /venue-status") {
      state.venueStatus={...state.venueStatus,...json(),updated_by:account.name,updated_at:new Date().toISOString()};
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
    else if(key==="GET /analytics/shifts") {
      state.analyticsReads++;
      if(state.delayAnalyticsReads) await new Promise(resolve=>setTimeout(resolve,500));
      response=state.analyticsShifts;
    }
    else if(key==="GET /notices") response={notices:[]};
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
  await confirm.click();
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
  await dialog.getByRole("button",{name:"¥700",exact:true}).first().click();
  await expect(dialog.getByRole("button",{name:"数量を減らす"})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"数量を増やす"})).toBeVisible();
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
  await dialog.getByRole("button",{name:"¥700",exact:true}).first().click();
  await dialog.getByRole("button",{name:"¥600",exact:true}).first().click();
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

test("Analytics coalesces focus and push bursts and does not refetch on range changes",async ({page})=>{
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
  await page.waitForTimeout(100);
  expect(state.analyticsReads).toBe(2);
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

test("Profile opens on personal stats and keeps shift controls and account settings in separate views", async ({ page }) => {
  await mockedPOS(page);
  await page.goto("/profile");
  await expect(page.getByRole("region", { name: "My work records" })).toBeVisible();
  const scales = page.getByRole("group", { name: "Time scale" });
  await expect(scales.getByRole("button", { name: "All Time" })).toHaveAttribute("aria-pressed", "true");
  await scales.getByRole("button", { name: "Monthly" }).click();
  await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
  await page.getByRole("tab", { name: "Income" }).click();
  await expect(page.getByRole("heading", { name: "Income breakdown" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My time clock" })).toHaveCount(0);
  await page.getByRole("button", { name: "Shift", exact: true }).click();
  await expect(page.getByRole("region", { name: "My time clock" })).toBeVisible();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(page.getByRole("region", { name: "Account settings" })).toBeVisible();
  await expect(page.getByRole("region", { name: "My time clock" })).toHaveCount(0);
});

test("historical-hours reconciliation reveals each step only when it is actionable", async ({ page }) => {
  await mockedPOS(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin");
  const adminNav = page.getByRole("navigation", { name: "Admin sections" });
  await expect(adminNav.getByRole("button", { name: "Overview" })).toBeVisible();
  await expect(adminNav.getByRole("button", { name: "Pay deductions" })).toBeVisible();
  expect(await adminNav.evaluate(element => element.getBoundingClientRect().right <= window.innerWidth)).toBe(true);
  await adminNav.getByRole("button", { name: "Historical hours" }).click();

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
  await expect(dialog.getByRole("button",{name:"¥723",exact:true})).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe("");
});
