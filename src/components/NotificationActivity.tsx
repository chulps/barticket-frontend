import { Link } from 'react-router-dom';
import { PUSH_TYPES } from '../api/notificationPreferences';
import { useNotificationActivity } from '../hooks/useNotificationActivity';
import { useI18n } from '../i18n';

export default function NotificationActivity({activeStockIds}:{activeStockIds:number[]}) {
  const {locale}=useI18n(),ja=locale==='ja';
  const {items,received,connected,shiftId}=useNotificationActivity();
  const visible=items.filter(item=>item.stock_notice_id===null || !activeStockIds.includes(item.stock_notice_id)).slice().reverse();
  return <section aria-labelledby="activity-heading">
    <h3 id="activity-heading">{ja?'現在の営業のアクティビティ':'Current shift activity'}</h3>
    <p>{ja?'プッシュ設定や出勤状態にかかわらず、このアカウントで閲覧できるアクティビティを表示します。営業終了時にこの一覧をクリアします。':'Activity you can access appears here regardless of push settings or clock-in status. This list clears when the shift closes.'}</p>
    {!connected||!received?<p role="status">{received?(ja?'ライブ更新が切断されました。表示内容が古い可能性があります。':'Live updates disconnected. Activity may be outdated.'):(ja?'ライブ接続を待っています。':'Waiting for the live connection.')}</p>:null}
    {received&&shiftId===null?<p>{ja?'営業中のシフトはありません。':'No shift is open.'}</p>:null}
    {received&&shiftId!==null&&!visible.length?<p>{ja?'この営業のアクティビティはまだありません。':'No activity in this shift yet.'}</p>:null}
    <ul>{visible.map(item=>{
      const label=PUSH_TYPES.find(([type])=>type===item.type);
      return <li key={item.id}>
        <span>{label?label[ja?2:1]:(ja?'アクティビティ':'Activity')}</span>{' · '}
        <time dateTime={new Date(item.at*1000).toISOString()}>{new Date(item.at*1000).toLocaleTimeString(ja?'ja-JP':'en-US')}</time>
        {item.ticket_id!==null?<>{' · '}<Link to={`/notifications?ticket=${item.ticket_id}`}>{ja?`伝票 #${item.ticket_id}`:`Ticket #${item.ticket_id}`}</Link></>:null}
      </li>;
    })}</ul>
  </section>;
}
