import styled from 'styled-components';
import { Link } from 'react-router-dom';
import { PUSH_TYPES } from '../api/notificationPreferences';
import { useNotificationActivity } from '../hooks/useNotificationActivity';
import { useI18n } from '../i18n';

export default function NotificationActivity({activeStockIds}:{activeStockIds:number[]}) {
  const {locale}=useI18n(),ja=locale==='ja';
  const {items,received,connected,shiftId,hasMore}=useNotificationActivity();
  const visible=items.filter(item=>item.stock_notice_id===null || !activeStockIds.includes(item.stock_notice_id)).slice().reverse();
  return <ActivitySection aria-labelledby="activity-heading">
    <SectionHeading id="activity-heading">{ja?'現在の営業のアクティビティ':'Current shift activity'}</SectionHeading>
    <Description>{ja?'閲覧権限のあるアクティビティを表示。プッシュ設定・出勤状態に関係なく、営業終了時にクリアします。':'Activity you can access, regardless of push settings or clock-in. Clears when the shift closes.'}</Description>
    {!connected||!received?<p role="status">{received?(ja?'ライブ更新が切断されました。表示内容が古い可能性があります。':'Live updates disconnected. Activity may be outdated.'):(ja?'ライブ接続を待っています。':'Waiting for the live connection.')}</p>:null}
    {received&&shiftId===null?<p>{ja?'営業中のシフトはありません。':'No shift is open.'}</p>:null}
    {received&&shiftId!==null&&!visible.length?<p>{hasMore?(ja?'最近のアクティビティに追加の項目はありません。':'No additional items in recent activity.'):(ja?'この営業のアクティビティはまだありません。':'No activity in this shift yet.')}</p>:null}
    {hasMore?<p role="status">{ja?'最近のアクティビティのみを表示しています（最大200件）。表示済みの在庫通知を除くため、件数が少なくなる場合があります。終了した営業の履歴は分析画面で確認できます。':'Recent activity only (up to 200 events). Stock notices already shown separately are omitted, so fewer may appear. Closed-shift history is available in Analytics.'}</p>:null}
    <ActivityList role="list">{visible.map(item=>{
      const label=PUSH_TYPES.find(([type])=>type===item.type);
      return <ActivityRow key={item.id}>
        <EventMeta>
        <span>{label?label[ja?2:1]:(ja?'アクティビティ':'Activity')}</span>
        <time title={new Date(item.at*1000).toLocaleString(ja?'ja-JP':'en-US')} dateTime={new Date(item.at*1000).toISOString()}>{new Date(item.at*1000).toLocaleTimeString(ja?'ja-JP':'en-US', {hour:'numeric', minute:'2-digit'})}</time></EventMeta>
        {item.ticket_id!==null?<TicketLink to={`/notifications?ticket=${item.ticket_id}`}>{ja?`伝票 #${item.ticket_id}`:`Ticket #${item.ticket_id}`}<span aria-hidden="true"> — </span><bdi>{typeof item.ticket_name === 'string' ? item.ticket_name.trim() || (ja?'名称未設定':'Unnamed ticket') : (ja?'名称を取得できません':'Name unavailable')}</bdi></TicketLink>:null}
      </ActivityRow>;
    })}</ActivityList>
  </ActivitySection>;
}

const ActivitySection = styled.section`
  margin-block: var(--space-3); min-width: 0;
`;
const SectionHeading = styled.h3`
  margin: 0 0 var(--space-1); font-size: var(--font-size-h4); line-height: 1.4;
`;
const Description = styled.p`
  margin: 0 0 var(--space-2); max-width: 65ch; color: var(--neutral-200); line-height: 1.5;
`;
const ActivityList = styled.ul`
  list-style: none; margin: 0; padding: 0;
`;
const ActivityRow = styled.li`
  margin: 0; padding-block: var(--space-2); min-width: 0;
  & + & { border-top: 1px solid var(--neutral-700); }
`;
const EventMeta = styled.div`
  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between;
  gap: var(--space-0) var(--space-2); line-height: 1.5;
  > span { font-weight: 500; overflow-wrap: anywhere; }
  time { color: var(--neutral-200); white-space: nowrap; font-variant-numeric: tabular-nums; }
`;
const TicketLink = styled(Link)`
  display: block; width: fit-content; max-width: 100%; min-height: 44px;
  align-content: center; padding-block: var(--space-0); line-height: 1.5;
  overflow-wrap: anywhere; color: var(--royal-300); text-decoration: underline;
  text-underline-offset: 0.2em;
  &:hover { color: var(--royal-200); }
  &:focus-visible { outline: 2px solid var(--royal-200); outline-offset: 3px; }
`;
