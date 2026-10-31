import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { preparePages } from "../../scripts/prepare-pages.mjs";

const base = "/barticket-frontend/";
let directory, server, origin;
const mime = {".js":"text/javascript", ".css":"text/css", ".html":"text/html; charset=utf-8", ".svg":"image/svg+xml", ".webmanifest":"application/manifest+json"};
test.beforeAll(async()=>{
 directory=mkdtempSync(join(tmpdir(),"barticket-pages-"));
 execFileSync(process.execPath,[resolve("node_modules/vite/bin/vite.js"),"build","--outDir",directory],{
  env:{...process.env,BASE_PATH:base,VITE_API_URL:"http://127.0.0.1:8765"},stdio:"pipe",
 });
 preparePages(directory);
 // Static-file behavior only: directory canonicalization and custom404 body.
 // No dev-server SPA rewrite, so a missing route entry cannot silently pass.
 server=createServer((req,res)=>{
  const url=new URL(req.url,"http://fixture.invalid");
  if(!url.pathname.startsWith(base)){res.writeHead(404);res.end();return;}
  const path=resolve(directory,decodeURIComponent(url.pathname.slice(base.length)));
  if(path!==directory&&!path.startsWith(directory+sep)){res.writeHead(403);res.end();return;}
  let file=path;
  try{
   if(statSync(path).isDirectory()){
    if(!url.pathname.endsWith("/")){res.writeHead(301,{Location:url.pathname+"/"+url.search});res.end();return;}
    file=join(path,"index.html");
   }
   const data=readFileSync(file);const extension=file.slice(file.lastIndexOf("."));res.writeHead(200,{"Content-Type":mime[extension]??"application/octet-stream"});res.end(data);
  }catch{res.writeHead(404,{"Content-Type":"text/html; charset=utf-8"});res.end(readFileSync(join(directory,"404.html")));}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 origin=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));if(directory)rmSync(directory,{recursive:true,force:true});});

test("built Pages static entries preserve direct Admin, assets, query and browser history",async({page,request})=>{
 const direct=await request.get(origin+base+"admin?fixture=1",{maxRedirects:0});expect(direct.status()).toBe(301);expect(direct.headers().location).toBe(base+"admin/?fixture=1");
 for(const path of ["admin","profile","menu","tickets","analytics","notifications","receivables","schedules"]){
  const response=await request.get(origin+base+path+"?fixture=1");expect(response.status()).toBe(200);expect(response.url()).toBe(origin+base+path+"/?fixture=1");
 }
 const fallback=await request.get(origin+base+"admin/staff/7/audit?fixture=1");expect(fallback.status()).toBe(404);expect(await fallback.text()).toBe(readFileSync(join(directory,"index.html"),"utf8"));
 const writes=[],assets=[];
 await page.addInitScript(()=>{localStorage.setItem("barticket_token","STATIC_ROUTE_FIXTURE");localStorage.setItem("barticket_locale","en");});
 await page.route("**/*",route=>new URL(route.request().url()).hostname==="127.0.0.1"?route.continue():route.abort());
 await page.route("http://127.0.0.1:8765/**",route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"GET,OPTIONS"}});
  if(req.method()!=="GET")writes.push(path);
  let body={};
  if(path==="/auth/me")body={id:7,name:"Fixture manager",role:"manager",email:"fixture@example.invalid",has_password:true};
  else if(path==="/admin/payment-setup/access")body={can_configure:false};
  else if(path==="/menu")body={items:[]};
  else if(path==="/notices")body={notices:[]};
  else if(path==="/shifts/current")body=null;
  else if(path==="/users"||path==="/tickets")body=[];
  else if(path==="/tickets/42")body={id:42,name:"Deep link fixture",status:"paid",total:0,guest_count:0,items:[],staff_drinks:[],created_at:1};
  else if(path==="/realtime/events")body={events:[],cursor:0};
  return route.fulfill({json:body,headers:{"Access-Control-Allow-Origin":"*"}});
 });
 page.on("response",response=>{if(response.url().startsWith(origin+base+"assets/"))assets.push({url:response.url(),status:response.status()});});
 const response=await page.goto(origin+base+"admin?fixture=1");expect(response.status()).toBe(200);
 await expect(page.getByRole("heading",{name:"Admin",exact:true})).toBeVisible();
 await expect(page).toHaveURL(origin+base+"admin/?fixture=1");
 await page.getByRole("link",{name:"Drink Menu",exact:true}).click();await expect(page).toHaveURL(origin+base+"menu");
 await page.goBack();await expect(page).toHaveURL(origin+base+"admin/?fixture=1");await expect(page.getByRole("heading",{name:"Admin",exact:true})).toBeVisible();
 await page.goto(origin+base+"notifications?ticket=42&from_push=1");
 await expect(page.getByRole("region",{name:"Linked ticket",exact:true})).toContainText("Deep link fixture");
 await expect(page).toHaveURL(origin+base+"notifications/?ticket=42&from_push=1");
 const dynamic=await page.goto(origin+base+"admin/staff/7/audit?fixture=1");expect(dynamic.status()).toBe(404);
 await expect(page.getByRole("heading",{name:"Audit history",exact:true})).toBeVisible();
 await expect(page).toHaveURL(origin+base+"admin/staff/7/audit?fixture=1");
 expect(assets.length).toBeGreaterThan(2);expect(assets.every(item=>item.status===200)).toBe(true);expect(writes).toEqual([]);
});
