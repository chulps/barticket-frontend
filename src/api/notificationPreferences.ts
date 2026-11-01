import { apiRequest } from './client';

export const PUSH_TYPES = [
  ['ticket_created', 'New tickets', '新しい伝票'],
  ['ticket_updated', 'Ticket updates', '伝票の更新'],
  ['ticket_payment_recorded', 'Payments recorded', '支払記録'],
  ['ticket_payment_deferred', 'Payments deferred', '後払い'],
  ['ticket_balance_written_off', 'Balances written off', '残高の償却'],
  ['ticket_payment_corrected', 'Payment corrections', '支払の訂正'],
  ['ticket_closed', 'Ticket cancellations', '伝票のキャンセル'],
  ['stock', 'Stock changes', '在庫状況の変更'],
  ['staff_drink', 'Staff drinks', 'スタッフドリンク'],
  ['shift_opened', 'Shift opened / reopened', '営業開始・再開'],
  ['shift_closed', 'Shift closed', '営業終了'],
  ['shift_kept_open', 'Shift kept open', '営業の継続'],
  ['punch_corrected', 'Staff time corrections', '勤務時間の訂正'],
  ['clock_in', 'Staff clock-ins', 'スタッフの出勤'],
  ['clock_out', 'Staff clock-outs', 'スタッフの退勤'],
  ['noon_clock_out', 'Noon clock-outs', '正午の退勤処理'],
] as const;
export type PushType = typeof PUSH_TYPES[number][0];
export type PushPreferences = Record<PushType, boolean>;
function validate(result: { preferences: PushPreferences }): PushPreferences {
  if (!result?.preferences || PUSH_TYPES.some(([key]) => typeof result.preferences[key] !== 'boolean')) {
    throw new Error('Invalid notification preferences');
  }
  return result.preferences;
}
export async function getNotificationPreferences() {
  return validate(await apiRequest<{ preferences: PushPreferences }>('/push/preferences'));
}
export async function updateNotificationPreference(type: PushType, enabled: boolean) {
  return validate(await apiRequest<{ preferences: PushPreferences }>('/push/preferences', {
    method: 'PATCH', body: { preferences: { [type]: enabled } },
  }));
}
