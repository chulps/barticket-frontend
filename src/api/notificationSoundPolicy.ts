export type SoundCue = 'ticket_created' | 'ticket_paid' | 'stock_out';
export type SoundEvent = { eventId: string; eventType: string; occurredAt: number; soundCue: SoundCue };
/** Only explicit server transitions, never snapshots, refresh hints or old pushes. */
export function freshSoundEvent(value: unknown, now: number, armedAt: number): SoundEvent | null {
  if (!value || typeof value !== 'object') return null;
  const e = value as Partial<SoundEvent>;
  if (typeof e.eventId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(e.eventId)) return null;
  if (typeof e.occurredAt !== 'number' || !Number.isFinite(e.occurredAt)) return null;
  const time = e.occurredAt * 1000;
  if (time < armedAt || time > now + 1000 || now - time > 15000) return null;
  if (!['ticket_created', 'ticket_paid', 'stock_out'].includes(e.soundCue ?? '')) return null;
  const expectedType = e.soundCue === 'ticket_paid' ? 'ticket_payment_recorded' : e.soundCue === 'stock_out' ? 'stock' : 'ticket_created';
  if (e.eventType !== expectedType) return null;
  return e as SoundEvent;
}
export function retainRecentSoundIds(value: unknown, now: number): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, time]) =>
    /^[0-9a-f-]{36}$/i.test(id) && typeof time === 'number' && time <= now && now - time < 60000,
  ).slice(-100));
}
