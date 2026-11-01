import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import Icon from './Icon';
import PushSettings from './PushSettings';
import NotificationPreferences from './NotificationPreferences';
import { useI18n } from '../i18n';

const PHONE_QUERY = '(max-width: 767px)';
const SETTINGS_PARAM = 'notificationSettings';
function subscribePhone(change: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}
const isPhone = () => window.matchMedia(PHONE_QUERY).matches;

/** Keep settings mounted: closing or resizing must not restart reads or cancel saves. */
export default function NotificationSettings() {
  const { locale } = useI18n();
  const ja = locale === 'ja';
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const open = params.get(SETTINGS_PARAM) === '1';
  const container = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const closing = useRef(false);

  const close = useCallback((replaceEntry = false) => {
    if (closing.current) return;
    closing.current = true;
    // An entry opened here consumes Back; a direct URL closes in place instead
    // of navigating away from the app. Preserve any linked-ticket parameters.
    if (!replaceEntry && location.state?.notificationSettingsReturn === true) {
      void navigate(-1);
    } else {
      const next = new URLSearchParams(params);
      next.delete(SETTINGS_PARAM);
      setParams(next, { replace: true, state: { ...location.state, notificationSettingsReturn: false } });
    }
  }, [location.state, navigate, params, setParams]);

  useLayoutEffect(() => {
    if (!open || !phone) return;
    const x = window.scrollX, y = window.scrollY;
    const body = document.body;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow };
    // Fixed-body locking also prevents touch scrolling behind a modal on iOS.
    Object.assign(body.style, { position: 'fixed', top: `${-y}px`, left: `${-x}px`, width: '100%', overflow: 'hidden' });
    return () => { Object.assign(body.style, previous); window.scrollTo(x, y); };
  }, [open, phone]);

  useLayoutEffect(() => {
    const dialog = panel.current;
    if (!dialog) return;
    closing.current = false;
    if (!open) {
      if (dialog.open) dialog.close();
      if (wasOpen.current && trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
      wasOpen.current = false;
      lastFocused.current = null;
      return;
    }
    wasOpen.current = true;
    // Native modal presentation traps focus and makes the rest of the document
    // inert. The same DOM subtree remains mounted in the desktop popover.
    const focused = lastFocused.current;
    if (dialog.open) dialog.close();
    if (phone) dialog.showModal(); else dialog.show();
    (focused ?? closeButton.current)?.focus({ preventScroll: true });
    return () => {
      lastFocused.current = dialog.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
      dialog.close();
    };
  }, [open, phone]);


  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!phone && event.target instanceof Node && !container.current?.contains(event.target)) close(true);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [close, open, phone]);

  return <Container ref={container}>
    <OptionsButton ref={trigger} type="button" aria-label={ja ? '通知設定' : 'Notification settings'} aria-expanded={open} aria-controls="notification-settings-panel" aria-haspopup={phone ? 'dialog' : undefined} onClick={() => {
      if (open) { close(); return; }
      const next = new URLSearchParams(params);
      next.set(SETTINGS_PARAM, '1');
      setParams(next, { replace: !phone, state: { ...location.state, notificationSettingsReturn: phone } });
    }}>
      <Icon name="DotsThreeOutlineVertical" size={24} />
    </OptionsButton>
    <SettingsPanel ref={panel} id="notification-settings-panel" role={phone ? 'dialog' : 'region'} aria-modal={phone ? true : undefined} aria-labelledby="notification-settings-heading" onCancel={event => { event.preventDefault(); close(); }}>
      <PanelHeading><h3 id="notification-settings-heading">{ja ? '通知設定' : 'Notification settings'}</h3>
        <OptionsButton ref={closeButton} type="button" aria-label={ja ? '通知設定を閉じる' : 'Close notification settings'} onClick={() => close()}><Icon name="X" size={24} /></OptionsButton>
      </PanelHeading>
      <SettingsContent>
        <PushSettings />
        <NotificationPreferences />
      </SettingsContent>
    </SettingsPanel>
  </Container>;
}
const Container = styled.div`flex: 0 0 44px;`;
const OptionsButton = styled.button`
  &&, &&:hover, &&:active { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 44px; width: 44px; min-width: 44px; height: 44px; min-height: 44px; padding: 0; background: transparent; color: var(--white); transform: none; filter: none; box-shadow: none; }
  &&:focus-visible { outline: 2px solid var(--royal-300); outline-offset: 2px; }
`;
const SettingsPanel = styled.dialog`
  &:not([open]) { display: none; }
  &[open] { display: flex; }
  flex-direction: column; min-height: 0; box-sizing: border-box;
  position: absolute; z-index: 30; inset: 100% 0 auto auto; margin: 0;
  width: min(640px, calc(100vw - 36px)); max-width: none;
  max-height: 70vh; max-height: 70dvh; overflow: hidden; padding: 0;
  color: var(--white); border: 1px solid var(--neutral-600); border-radius: 12px;
  background: var(--neutral-950); box-shadow: 0 8px 28px #0008;
  @media (max-width: 767px) {
    position: fixed; inset: 0; width: 100%; height: 100vh; height: 100dvh;
    max-height: none; border: 0; border-radius: 0; box-shadow: none;
  }
  &::backdrop { background: var(--neutral-950); }
`;
const PanelHeading = styled.div`
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--space-1);
  padding: var(--space-2); padding-bottom: var(--space-1);
  h3 { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  @media (max-width: 767px) {
    padding-top: max(var(--space-2), env(safe-area-inset-top, 0px));
    padding-left: max(var(--space-2), env(safe-area-inset-left, 0px));
    padding-right: max(var(--space-2), env(safe-area-inset-right, 0px));
  }
`;
const SettingsContent = styled.div`
  min-height: 0; overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch;
  padding: var(--space-1) var(--space-2) var(--space-2); scroll-padding-block: var(--space-1);
  section:last-child { margin-bottom: 0; }
  @media (max-width: 767px) {
    padding-left: max(var(--space-2), env(safe-area-inset-left, 0px));
    padding-right: max(var(--space-2), env(safe-area-inset-right, 0px));
    padding-bottom: max(var(--space-2), env(safe-area-inset-bottom, 0px));
  }
`;
