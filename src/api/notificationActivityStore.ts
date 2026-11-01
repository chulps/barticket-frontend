import { applyActivityFrame, type ActivitySnapshot } from './notificationActivity';
const empty=():ActivitySnapshot=>({shiftId:null,items:[],received:false,connected:false,hasMore:false});
let snapshot=empty(),owner:string|null=null;
let lastCursor=-1,awaitingReset=true;
const listeners=new Set<()=>void>();
const changed=()=>listeners.forEach(listener=>listener());
export function resetActivityAccount(token:string|null) {
  if(token===owner) return;
  owner=token; snapshot=empty(); lastCursor=-1; awaitingReset=true; changed();
}
export function receiveNotificationActivity(value:unknown,token:string|null) {
  resetActivityAccount(token);
  if(!token || (awaitingReset && (!value || typeof value!=='object' || !('reset' in value) || value.reset!==true))) return;
  const next=applyActivityFrame(snapshot,value);
  if(next) {
    const cursor=(value as {cursor:number}).cursor;
    if(cursor<=lastCursor) return;
    lastCursor=cursor;awaitingReset=false;snapshot=next;changed();
  }
}
export function activityConnectionChanged(connected:boolean) {
  // Transport ready is not activity ready: old servers may ignore capability.
  // Only an authoritative reset for this connection can mark the feed current.
  if(connected) return;
  lastCursor=-1;awaitingReset=true;
  if(snapshot.connected) {snapshot={...snapshot,connected:false};changed();}
}
export const getActivitySnapshot=()=>snapshot;
export function subscribeActivity(listener:()=>void) {listeners.add(listener);return ()=>{listeners.delete(listener);};}
