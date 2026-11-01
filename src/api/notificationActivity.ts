export type ActivityItem = { id: number; type: string; at: number; ticket_id: number | null; stock_notice_id: number | null };
export type ActivityFrame = { type: 'activity'; version: 1; cursor: number; shift_id: number | null; reset: boolean; items: ActivityItem[]; has_more: boolean };
export type ActivitySnapshot = { shiftId: number | null; items: ActivityItem[]; received: boolean; connected: boolean; hasMore: boolean };
const positiveId = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
export function validActivityItem(item: ActivityItem) {
  return !!item && positiveId(item.id) && typeof item.type === 'string' && item.type.length <= 80 && Number.isFinite(item.at) && item.at > 0 && item.at <= 8640000000000 && (item.ticket_id === null || positiveId(item.ticket_id)) && (item.stock_notice_id === null || positiveId(item.stock_notice_id));
}
export function applyActivityFrame(current: ActivitySnapshot, value: unknown): ActivitySnapshot | null {
  if(!value || typeof value !== 'object') return null;
  const frame=value as ActivityFrame;
  if(frame.type!=='activity' || frame.version!==1 || !Number.isSafeInteger(frame.cursor) || frame.cursor<0 || typeof frame.reset!=='boolean' || typeof frame.has_more!=='boolean' || !Array.isArray(frame.items) || frame.items.length>200 || (frame.shift_id!==null && !positiveId(frame.shift_id)) || frame.items.some(item=>!validActivityItem(item))) return null;
  if(frame.shift_id===null && (!frame.reset || frame.items.length)) return null;
  if(!frame.reset && (!current.received || current.shiftId!==frame.shift_id)) return null;
  const rows=frame.reset?frame.items:[...current.items,...frame.items];
  const unique=[...new Map(rows.map(item=>[item.id,item])).values()].sort((a,b)=>a.id-b.id);
  const hasMore=frame.shift_id!==null && (frame.has_more || unique.length>200 || (!frame.reset && current.hasMore));
  return {shiftId:frame.shift_id,items:unique.slice(-200),received:true,connected:true,hasMore};
}
