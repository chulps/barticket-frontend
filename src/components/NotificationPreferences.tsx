import { useEffect, useState } from 'react';
import styled from 'styled-components';
import { getToken } from '../api/client';
import { getNotificationPreferences, updateNotificationPreference, PUSH_TYPES, type PushPreferences, type PushType } from '../api/notificationPreferences';
import { automaticSoundsSupported, disableSounds, enableSounds, previewSound, soundsEnabled, soundsReady } from '../api/notificationSounds';
import type { SoundCue } from '../api/notificationSoundPolicy';
import { useI18n } from '../i18n';

export default function NotificationPreferences() {
  const { locale } = useI18n();
  const ja = locale === 'ja';
  const audioSupported = automaticSoundsSupported();
  const [preferences, setPreferences] = useState<PushPreferences | null>(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState<PushType | null>(null);
  const [error, setError] = useState('');
  const [soundError, setSoundError] = useState('');
  const [enabled, setEnabled] = useState(soundsEnabled);
  const [ready, setReady] = useState(soundsReady);
  const [audioBusy, setAudioBusy] = useState(false);
  useEffect(() => {
    const auth = () => { setPreferences(null); setBusy(null); setError(''); setRevision(r => r + 1); };
    const sound = () => { setEnabled(soundsEnabled()); setReady(soundsReady()); };
    window.addEventListener('barticket-auth', auth);
    window.addEventListener('barticket-sound-settings', sound);
    return () => { window.removeEventListener('barticket-auth', auth); window.removeEventListener('barticket-sound-settings', sound); };
  }, []);
  useEffect(() => {
    let active = true;
    const token = getToken();
    void getNotificationPreferences().then(result => {
      if (active && getToken() === token) { setPreferences(result); setError(''); }
    }).catch(() => {
      if (active && getToken() === token) setError(ja ? '通知の種類を読み込めませんでした。' : 'Couldn’t load notification types.');
    });
    return () => { active = false; };
  }, [revision, ja]);
  const update = async (type: PushType) => {
    if (!preferences || busy) return;
    const token = getToken();
    setBusy(type); setError('');
    try {
      const saved = await updateNotificationPreference(type, !preferences[type]);
      if (getToken() === token) setPreferences(saved);
    } catch {
      if (getToken() === token) {
        setError(ja ? '保存を確認できませんでした。再読み込みして設定を確認してください。' : 'Couldn’t confirm the save. Reload settings to check their current state.');
        setPreferences(null);
      }
    } finally { if (getToken() === token) setBusy(null); }
  };
  const audio = async (cue?: SoundCue) => {
    const token = getToken();
    setAudioBusy(true); setSoundError('');
    try { if (cue) await previewSound(cue); else await enableSounds(); }
    catch { if (getToken() === token) setSoundError(ja ? '音声を再生できません。端末の音量を確認して再度タップしてください。' : 'Audio couldn’t start. Check device volume and tap again.'); }
    finally { if (getToken() === token) { setAudioBusy(false); setEnabled(soundsEnabled()); setReady(soundsReady()); } }
  };
  return <>
    <Panel aria-labelledby="push-types-heading">
      <h3 id="push-types-heading">{ja ? 'プッシュ通知の種類' : 'Push notification types'}</h3>
      <p>{ja ? 'このアカウントのすべての端末に適用されます。各端末でプッシュ通知を有効にしてください。アプリ内の通知一覧には影響しません。' : 'Applies to your account across devices. Push must also be enabled on each device. Your in-app notification list is unchanged.'}</p>
      <p>{ja ? '営業開始・終了と休暇申請の通知は勤務外でも届きます。その他の通知は出勤中のみです。' : 'Shift opening and closing alerts and time-off updates can arrive off shift. Other push alerts require you to be clocked in.'}</p>
      {error ? <p role="alert">{error} <button type="button" onClick={() => { setError(''); setRevision(r => r + 1); }}>{ja ? '再読み込み' : 'Reload settings'}</button></p> : null}
      {!preferences && !error ? <p role="status">{ja ? '設定を読み込み中…' : 'Loading settings…'}</p> : null}
      {preferences ? <Rows>{PUSH_TYPES.map(([type, en, jp]) => <Row key={type}>
        <span id={`push-type-${type}`}>{ja ? jp : en}</span>
        <Switch type="button" role="switch" aria-checked={preferences[type]} aria-labelledby={`push-type-${type}`} disabled={busy !== null} onClick={() => void update(type)}><span /></Switch>
      </Row>)}</Rows> : null}
      {busy ? <p role="status">{ja ? '保存中…' : 'Saving…'}</p> : null}
    </Panel>
    <SoundPanel aria-labelledby="sound-heading">
      <h3 id="sound-heading">{ja ? 'アプリ内のサウンド' : 'In-app sounds'}</h3>
      <SoundIntro>{ja ? 'BarTicketを開いている間の通知音。' : 'Notification sounds while BarTicket is open.'}</SoundIntro>
      <SoundToggleRow><span id="sound-toggle-label">{ja ? 'この端末でサウンドを使う' : 'Use sounds on this device'}</span><Switch type="button" role="switch" aria-checked={enabled} aria-labelledby="sound-toggle-label" disabled={audioBusy || (!audioSupported && !enabled)} onClick={() => enabled ? disableSounds() : void audio()}><span /></Switch></SoundToggleRow>
      {!audioSupported ? <SoundStatus role="status">{ja ? 'このブラウザーでは安全な自動サウンド再生を利用できません。対応ブラウザーで開いてください。通知自体は影響を受けません。' : 'Automatic sounds aren’t supported safely in this browser. Use a supported browser; notifications are unaffected.'}</SoundStatus> : null}
      {enabled && !ready && audioSupported ? <ResumeRow><SoundStatus role="status">{ja ? 'このセッションで音を鳴らすには再開してください。' : 'Resume to hear sounds in this session.'}</SoundStatus><button type="button" disabled={audioBusy} onClick={() => void audio()}>{ja ? 'サウンドを再開' : 'Resume sounds'}</button></ResumeRow> : null}
      {soundError ? <SoundStatus role="alert">{soundError}</SoundStatus> : null}
      <PreviewHeading>{ja ? 'サウンドを試聴' : 'Preview sounds'}</PreviewHeading>
      <SoundIntro>{ja ? '試聴だけでは通知音はオンになりません。' : 'Previews do not turn sounds on.'}</SoundIntro>
      <Previews>{([
        ['ticket_created', 'New ticket', '新しい伝票', 'Preview new ticket', '新しい伝票の音を試聴'],
        ['stock_out', 'Out of stock', '在庫切れ', 'Preview stockout', '在庫切れの音を試聴'],
        ['ticket_paid', 'Fully paid · cha-ching', '支払完了', 'Preview cha-ching', '支払完了の音を試聴'],
      ] as const).map(([cue, en, jp, enAction, jpAction]) => <PreviewRow key={cue}><span>{ja ? jp : en}</span><PreviewButton type="button" aria-label={ja ? jpAction : enAction} disabled={audioBusy} onClick={() => void audio(cue)}>{ja ? '試聴' : 'Preview'}</PreviewButton></PreviewRow>)}</Previews>
      <SoundIntro>{ja ? 'iPhone：消音モードを解除し、メディア音量を確認してください。' : 'iPhone: turn Silent mode off and check media volume.'}</SoundIntro>
      <SoundDetails><summary>{ja ? 'サウンドの配信条件と制限' : 'When sounds play & device limits'}</summary>
        <p>{ja ? '新しい伝票・在庫切れ・支払完了に異なる音を鳴らします。この端末のプッシュと該当する通知の種類がオンの場合のみです。操作した端末を除くなど、既存の通知ルールが適用されます。' : 'Different cues for new tickets, stockouts and fully paid tickets. Requires push on this device and the matching notification type to be on. Existing delivery rules still apply, including excluding the device making a ticket change.'}</p>
        <p>{ja ? 'アプリを閉じた状態やロック画面の通知音は端末が管理します。このサウンドには変更できません。' : 'Closed-app and lock-screen notification sounds are controlled by your device; these custom sounds cannot replace them.'}</p>
        <p>{ja ? 'サインアウトやアカウント変更時はオフになります。' : 'Signing out or switching accounts turns sounds off.'}</p>
      </SoundDetails>
    </SoundPanel>
  </>;
}
const Panel = styled.section`
  margin: 0 0 var(--space-2); padding: var(--space-2); border: 1px solid var(--neutral-700); border-radius: 12px;
  background: var(--neutral-900); min-width: 0; overflow-wrap: anywhere;
  h3 { margin: 0 0 var(--space-1); } p { color: var(--neutral-300); }
`;
const Rows = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 0 var(--space-3);`;
const Row = styled.div`display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); min-height: 48px; border-bottom: 1px solid var(--neutral-800); span { min-width: 0; }`;
const Switch = styled.button`
  &&, &&:hover, &&:active { background: transparent; filter: none; transform: none; box-shadow: none; -webkit-tap-highlight-color: transparent; }
  display: block; text-align: left;
  flex: 0 0 48px; width: 48px; min-width: 48px; height: 44px; min-height: 44px; padding: 11px 3px; border-radius: 20px;
  background: transparent; border: 0; position: relative;
  &::before { content: ""; position: absolute; inset: 8px 0; border-radius: 20px; background: var(--neutral-700); border: 1px solid var(--neutral-400); }
  span { display: block; width: 20px; height: 20px; border-radius: 50%; background: white; position: relative; transform: translateX(0); }
  &[aria-checked='true']::before { background: var(--success-500); }
  &[aria-checked='true'] span { transform: translateX(19px); }
  &:focus-visible { outline: 3px solid var(--royal-400); outline-offset: 3px; }
  &:disabled { opacity: .6; }
`;
const SoundPanel = styled(Panel)`
  h3 { font-size: var(--font-size-h4); line-height: 1.4; }
  p { color: var(--neutral-200); line-height: 1.5; }
`;
const SoundIntro = styled.p`margin: 0 0 var(--space-1);`;
const SoundToggleRow = styled(Row)`border-bottom: 0; margin-block: var(--space-1) var(--space-2); font-weight: 500;`;
const SoundStatus = styled.p`margin: 0;`;
const ResumeRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2);
  margin-block: var(--space-1) var(--space-2);
  p { flex: 1 1 180px; }
  button { flex: none; width: auto; max-width: 100%; white-space: normal; overflow-wrap: anywhere; min-height: 44px; padding: var(--space-1) var(--space-2); line-height: 1.4; }
`;
const PreviewHeading = styled.h4`font-size: var(--font-size-h5); margin: var(--space-2) 0 var(--space-0); line-height: 1.5;`;
const Previews = styled.div`margin-block: var(--space-1) var(--space-2);`;
const PreviewRow = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-1);
  min-height: 60px; padding-block: var(--space-0);
  & + & { border-top: 1px solid var(--neutral-700); }
  span { flex: 1 1 120px; min-width: 0; overflow-wrap: anywhere; line-height: 1.5; }
`;
const PreviewButton = styled.button`
  && { background: var(--neutral-700); color: var(--white); width: auto; max-width: 100%; white-space: normal; overflow-wrap: anywhere; min-width: 88px; min-height: 44px; padding: var(--space-1) var(--space-2); flex: none; }
  &&:hover { background: var(--neutral-600); }
  &&:focus-visible { outline: 2px solid var(--royal-200); outline-offset: 3px; }
`;
const SoundDetails = styled.details`
  margin-top: var(--space-2); color: var(--neutral-200);
  summary { cursor: pointer; min-height: 44px; align-content: center; line-height: 1.5; padding-block: var(--space-1); }
  summary:focus-visible { outline: 2px solid var(--royal-200); outline-offset: 3px; }
  p { margin: var(--space-1) 0; }
`;
