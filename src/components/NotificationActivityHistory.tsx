import {useEffect,useRef,useState} from 'react';
import {getToken} from '../api/client';
import {getActivityHistory,type ActivityHistoryPage} from '../api/notificationActivityHistory';
import {PUSH_TYPES} from '../api/notificationPreferences';
import {useI18n} from '../i18n';
export default function NotificationActivityHistory({shiftId}:{shiftId:number}) {
  const {locale}=useI18n(),ja=locale==='ja';
  const [page,setPage]=useState<ActivityHistoryPage|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  const generation=useRef({value:0});
  useEffect(()=>{
    const lifecycle=generation.current;
    const reset=()=>{lifecycle.value++;setPage(null);setBusy(false);setFailed(false);};
    reset();window.addEventListener('barticket-auth',reset);window.addEventListener('barticket-users-updated',reset);
    return ()=>{lifecycle.value++;window.removeEventListener('barticket-auth',reset);window.removeEventListener('barticket-users-updated',reset);};
  },[shiftId]);
  const load=async(before?:number)=>{
    if(busy) return;
    const token=getToken(),version=generation.current.value;
    setBusy(true);setFailed(false);
    try {const result=await getActivityHistory(shiftId,before);if(version===generation.current.value&&token===getToken()) setPage(result);}
    catch {if(version===generation.current.value&&token===getToken()){setFailed(true);setPage(null);}}
    finally {if(version===generation.current.value&&token===getToken())setBusy(false);}
  };
  return <section aria-label={ja?'通知履歴':'Notification history'}>
    <button type="button" className="hollow secondary" disabled={busy} onClick={()=>void load()}>{ja?'通知履歴を見る':'View notification history'}</button>
    {busy?<p role="status">{ja?'読み込み中…':'Loading notification history…'}</p>:null}
    {failed?<p role="alert">{ja?'履歴を読み込めませんでした。上のボタンから再試行してください。':'Could not load history. Use the button above to retry.'}</p>:null}
    {page?<>
      <p>{ja?'この営業で記録された通知です。記録開始前の履歴は含まれません。':'Recorded notifications for this shift. History before recording began is not included.'}</p>
      {!page.items.length?<p>{ja?'記録された通知はありません。':'No recorded notifications.'}</p>:null}
      <ul>{page.items.map(item=>{const label=PUSH_TYPES.find(([type])=>type===item.type);return <li key={item.id}>{label?label[ja?2:1]:(ja?'アクティビティ':'Activity')}{' · '}<time dateTime={new Date(item.at*1000).toISOString()}>{new Date(item.at*1000).toLocaleString(ja?'ja-JP':'en-US')}</time>{item.ticket_id!==null?` · #${item.ticket_id}`:''}</li>;})}</ul>
      {page.has_more&&page.cursor!==null?<button type="button" disabled={busy} onClick={()=>void load(page.cursor!)}>{ja?'以前の通知':'Older notifications'}</button>:null}
    </>:null}
  </section>;
}
