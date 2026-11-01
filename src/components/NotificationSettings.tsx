import { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import Icon from './Icon';
import PushSettings from './PushSettings';
import NotificationPreferences from './NotificationPreferences';
import { useI18n } from '../i18n';

/** Keep settings mounted: closing this disclosure must not restart reads or cancel saves. */
export default function NotificationSettings() {
  const { locale } = useI18n();
  const ja = locale === 'ja';
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) {
        setOpen(false); trigger.current?.focus();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <Container ref={container}>
    <OptionsButton ref={trigger} type="button" aria-label={ja ? '通知設定' : 'Notification settings'} aria-expanded={open} aria-controls="notification-settings-panel" onClick={() => setOpen(value => !value)}>
      <Icon name="DotsThreeOutlineVertical" size={24} />
    </OptionsButton>
    <SettingsPanel id="notification-settings-panel" hidden={!open} role="region" aria-labelledby="notification-settings-heading">
      <PanelHeading><h3 id="notification-settings-heading">{ja ? '通知設定' : 'Notification settings'}</h3>
        <OptionsButton ref={closeButton} type="button" aria-label={ja ? '通知設定を閉じる' : 'Close notification settings'} onClick={close}><Icon name="X" size={24} /></OptionsButton>
      </PanelHeading>
      <PushSettings />
      <NotificationPreferences />
    </SettingsPanel>
  </Container>;
}
const Container = styled.div`flex: 0 0 44px;`;
const OptionsButton = styled.button`
  &&, &&:hover, &&:active { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 44px; width: 44px; min-width: 44px; height: 44px; min-height: 44px; padding: 0; background: transparent; color: var(--white); transform: none; filter: none; box-shadow: none; }
  &&:focus-visible { outline: 2px solid var(--royal-300); outline-offset: 2px; }
`;
const SettingsPanel = styled.div`
  &[hidden] { display: none; }
  position: absolute; z-index: 30; top: 100%; right: 0;
  width: min(640px, calc(100vw - 36px)); max-height: 70vh; max-height: 70dvh;
  overflow-y: auto; overscroll-behavior: contain; padding: var(--space-2);
  border: 1px solid var(--neutral-600); border-radius: 12px;
  background: var(--neutral-950); box-shadow: 0 8px 28px #0008;
  section:last-child { margin-bottom: 0; }
`;
const PanelHeading = styled.div`display: flex; align-items: center; justify-content: space-between; gap: var(--space-1); margin-bottom: var(--space-2); h3 { margin: 0; }`;
