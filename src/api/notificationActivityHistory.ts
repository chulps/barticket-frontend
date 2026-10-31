import {apiRequest} from './client';
import {validActivityItem,type ActivityItem} from './notificationActivity';
export type ActivityHistoryPage={shift_id:number;items:ActivityItem[];cursor:number|null;has_more:boolean};
export async function getActivityHistory(shiftId:number,before?:number):Promise<ActivityHistoryPage> {
  const page=await apiRequest<ActivityHistoryPage>(`/notifications/activity?shift_id=${shiftId}&limit=50${before===undefined?'':`&before=${before}`}`);
  if(!page || page.shift_id!==shiftId || !Array.isArray(page.items) || page.items.length>50 || typeof page.has_more!=='boolean') throw new Error('Invalid history page');
  let previous=before??Infinity;
  for(const item of page.items) {if(!validActivityItem(item)||item.id>=previous) throw new Error('Invalid history item');previous=item.id;}
  if(page.items.length && page.cursor!==page.items.at(-1)?.id) throw new Error('Invalid history cursor');
  if(page.has_more && (!page.items.length || !Number.isSafeInteger(page.cursor))) throw new Error('History cursor did not advance');
  return page;
}
