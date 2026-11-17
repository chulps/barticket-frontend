import { useEffect, useState } from 'react';
import { apiRequest, getToken, ApiError } from '../api/client';
import { shouldPoll } from '../api/realtime';
import { startBackgroundRefresh } from './backgroundRefresh';
import { createAnalyticsReadCache } from './analyticsReadCache';
import type { itemSales } from '../components/itemSales';
import type { SellingItem } from '../components/topSellingItems';
import type { ApiTicket } from '../api/tickets';
import { analyticsTicketScope } from './ticketReadScope';
export type ItemSalesSummary = ReturnType<typeof itemSales> & {topItems:SellingItem[];unknownDates:number};
export type TicketHistoryPage = {items:ApiTicket[];total:number;offset:number;limit:number};
const cache=createAnalyticsReadCache<unknown>();
const events=['barticket-push','barticket-analytics-updated','barticket-shift-updated','barticket-auth','barticket-users-updated','barticket-data-changed','barticket-session-expired','online','barticket-api-restored'];
// Invalidate even when Analytics is unmounted. Listener lifetime is module lifetime.
if(typeof window!=='undefined') {
    events.forEach(event=>window.addEventListener(event,cache.clear));
    window.addEventListener('storage',cache.clear);
}
export function analyticsPath(endpoint:string,range:'all'|'year'|'month'|'day',key:string,extra:Record<string,string>={}) {
    return `/analytics/${endpoint}?${new URLSearchParams({...analyticsTicketScope(range,key),...extra} as Record<string,string>)}`;
}
export function useAnalyticsData<T>(path:string|null, enabled:boolean) {
    const [snapshot,setSnapshot]=useState<{path:string;token:string;value:T|null;error:boolean}|null>(null);
    useEffect(()=>{
        if(!enabled || !path)return;
        let cancelled=false;
        const stop=startBackgroundRefresh({shouldPoll,events:[...events,'storage'],refresh:async()=>{
            const token=getToken();if(!token) {setSnapshot(null);return;}
            try {
                const value=await cache.read(token,path,()=>apiRequest<T>(path)) as T;
                if(!cancelled&&token===getToken())setSnapshot({path,token,value,error:false});
            } catch (error) {
                if(!cancelled&&token===getToken())setSnapshot(previous=>({path,token,value:!(error instanceof ApiError && [401,403].includes(error.status))&&previous?.path===path&&previous.token===token?previous.value:null,error:true}));
            }
        }});
        const clearIdentity=()=>setSnapshot(previous=>previous?.token===getToken()?previous:null);
        window.addEventListener('barticket-auth',clearIdentity);window.addEventListener('storage',clearIdentity);
        return ()=>{cancelled=true;stop();window.removeEventListener('barticket-auth',clearIdentity);window.removeEventListener('storage',clearIdentity);};
    },[enabled,path]);
    const current=enabled&&snapshot?.path===path&&snapshot.token===getToken()?snapshot:null;
    return {value:current?.value??null,ready:!enabled||current!==null,error:current?.error??false};
}
