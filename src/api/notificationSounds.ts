import { getToken } from './client';
import { freshSoundEvent, retainRecentSoundIds, type SoundCue } from './notificationSoundPolicy';

const SETTING = 'barticket_foreground_sounds';
const SEEN = 'barticket_foreground_sound_events';
let context: AudioContext | null = null;
const activeNotes = new Set<OscillatorNode>();
function stopNotes() {
  for (const note of activeNotes) { try { note.stop(); } catch { /* Already ended. */ } note.disconnect(); }
  activeNotes.clear();
}
let armedToken: string | null = null;
let armedAt = Infinity;
let lastPlayed = 0;
const changed = () => window.dispatchEvent(new Event('barticket-sound-settings'));
export function automaticSoundsSupported() {
  return typeof AudioContext !== 'undefined' && !!navigator.locks;
}
export function soundsEnabled() {
  try { return localStorage.getItem(SETTING) === 'on'; } catch { return false; }
}
export function soundsReady() {
  return soundsEnabled() && armedToken === getToken() && context?.state === 'running';
}
export function disableSounds() {
  try { localStorage.removeItem(SETTING); } catch { /* fail closed in this tab */ }
  armedToken = null; armedAt = Infinity;
  stopNotes();
  if (context) void context.suspend().catch(() => {});
  changed();
}
/** Call directly from a click, never from an effect or a received notification. */
export async function enableSounds() {
  if (!automaticSoundsSupported()) throw new Error('Automatic audio unsupported');
  const token = getToken();
  if (!token) throw new Error('Sign in first');
  context ??= new AudioContext();
  await context.resume();
  if (getToken() !== token || context.state !== 'running' || document.visibilityState !== 'visible') throw new Error('Audio unavailable');
  localStorage.setItem(SETTING, 'on');
  armedToken = token; armedAt = Date.now();
  changed();
}
function play(cue: SoundCue) {
  if (!context || context.state !== 'running' || document.visibilityState !== 'visible') return;
  const notes = cue === 'ticket_paid' ? [1046, 1318, 1568] : cue === 'stock_out' ? [440, 330] : [660, 880];
  const start = context.currentTime;
  notes.forEach((frequency, i) => {
    const oscillator = context!.createOscillator(), gain = context!.createGain();
    oscillator.type = cue === 'ticket_paid' ? 'triangle' : 'sine';
    oscillator.frequency.value = frequency;
    const at = start + i * 0.11;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.10, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
    oscillator.connect(gain); gain.connect(context!.destination);
    activeNotes.add(oscillator);
    oscillator.start(at); oscillator.stop(at + 0.18);
    oscillator.onended = () => { activeNotes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  });
}
export async function previewSound(cue: SoundCue) {
  // Preview unlocks audio but does not opt into future sounds.
  const token = getToken();
  if (!token) throw new Error('Sign in first');
  context ??= new AudioContext(); await context.resume();
  if (getToken() !== token || context.state !== 'running' || document.visibilityState !== 'visible') throw new Error('Audio unavailable');
  play(cue);
}
export function installNotificationSounds() {
  const receive = (event: Event) => {
    if (!soundsReady() || document.visibilityState !== 'visible' || !navigator.locks) return;
    const sound = freshSoundEvent((event as CustomEvent).detail, Date.now(), armedAt);
    if (!sound) return;
    const token = getToken();
    void navigator.locks.request('barticket-foreground-sound', () => {
      if (token !== getToken() || !soundsReady() || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (!freshSoundEvent(sound, now, armedAt)) return;
      try {
        const seen = retainRecentSoundIds(JSON.parse(localStorage.getItem(SEEN) || '{}'), now);
        if (seen[sound.eventId]) return;
        seen[sound.eventId] = now;
        localStorage.setItem(SEEN, JSON.stringify(seen));
        // Consume bursts rather than queueing delayed sounds after reconnect.
        if (now - lastPlayed < 700) return;
        lastPlayed = now; play(sound.soundCue);
      } catch { /* Without persistent cross-tab dedupe, stay silent. */ }
    }).catch(() => {});
  };
  const reset = () => disableSounds();
  const storage = (event: StorageEvent) => {
    if (event.key === 'barticket_token') reset();
    if (event.key === SETTING) {
      if (!soundsEnabled()) { armedToken = null; armedAt = Infinity; stopNotes(); if (context) void context.suspend().catch(() => {}); }
      changed();
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      armedAt = Infinity; armedToken = null;
      stopNotes();
      if (context) void context.suspend().catch(() => {});
      changed();
    }
  });
  window.addEventListener('barticket-push', receive);
  window.addEventListener('barticket-auth', reset);
  window.addEventListener('storage', storage);
}
