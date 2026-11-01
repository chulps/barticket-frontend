import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const settings=readFileSync('src/components/NotificationSettings.tsx','utf8');
const page=readFileSync('src/pages/Notifications.tsx','utf8');
const preferences=readFileSync('src/components/NotificationPreferences.tsx','utf8');
test('one heading settings action owns all three mounted panels, not the notification feed',()=>{
 assert.match(page,/<HeadingRow><Heading>.*?<\/Heading><NotificationSettings \/><\/HeadingRow>/);
 assert.match(settings,/const open = params.get\(SETTINGS_PARAM\) === '1'/);
 assert.match(settings,/<SettingsPanel ref=\{panel\}/);
 assert.match(settings,/:not\(\[open\]\) \{ display: none/);
 assert.match(settings,/<PushSettings \/>[\s\S]*<NotificationPreferences \/>/);
 assert.doesNotMatch(settings,/open &&|open \? <|NotificationActivity|apiRequest|fetch\(/);
 assert.match(page,/<NotificationActivity /);
 assert.doesNotMatch(preferences,/DotsThree|typesOpen|Notification type settings/);
});
test('shared disclosure supports keyboard dismissal and bounded internal scrolling',()=>{
 assert.match(settings,/aria-controls="notification-settings-panel"/);
 assert.match(settings,/aria-expanded=\{open\}/);
 assert.match(settings,/event.key === 'Escape'/);
 assert.match(settings,/pointerdown/);
 assert.match(settings,/trigger.current.focus\(\{ preventScroll: true \}\)/);
 assert.match(settings,/max-height: 70dvh/);
 assert.match(settings,/overflow-y: auto; overscroll-behavior: contain/);
 assert.doesNotMatch(settings,/role="menu"/);
});

test('phone presentation uses a native modal with a fixed header and one content scroller',()=>{
 assert.match(settings,/dialog.showModal\(\)/);
 assert.match(settings,/else dialog.show\(\)/);
 assert.match(settings,/max-width: 767px/);
 assert.match(settings,/position: fixed; inset: 0; width: 100%; height: 100vh; height: 100dvh/);
 assert.match(settings,/const PanelHeading = styled.div`[\s\S]*flex: none/);
 assert.match(settings,/const SettingsContent = styled.div`[\s\S]*min-height: 0; overflow-y: auto/);
 for(const edge of ['top','left','right','bottom'])assert.match(settings,new RegExp('safe-area-inset-'+edge));
 assert.match(settings,/Object.assign\(body.style, previous\); window.scrollTo\(x, y\)/);
 assert.doesNotMatch(settings,/document.body.innerHTML|createPortal|setTimeout/);
});
test('settings history preserves linked-ticket context and direct links close in place',()=>{
 assert.match(settings,/new URLSearchParams\(params\)/);
 assert.match(settings,/next.set\(SETTINGS_PARAM, '1'\)/);
 assert.match(settings,/notificationSettingsReturn: phone/);
 assert.match(settings,/navigate\(-1\)/);
 assert.match(settings,/next.delete\(SETTINGS_PARAM\)/);
 assert.match(settings,/replace: true, state: \{ ...location.state, notificationSettingsReturn: false \}/);
});

test('breakpoint changes preserve the focused control and repeated closes cannot traverse twice',()=>{
 assert.match(settings,/lastFocused.current = dialog.contains\(document.activeElement\)/);
 assert.match(settings,/const focused = lastFocused.current/);
 assert.match(settings,/if \(closing.current\) return/);
 assert.match(settings,/close\(true\)/);
 assert.match(settings,/replace: !phone/);
});

test('phone Tab loops visible enabled controls and auth changes replace the disclosure URL',()=>{
 assert.match(settings,/!phone \|\| event.key !== 'Tab'/);
 assert.match(settings,/element.tabIndex >= 0 && !element.matches\(':disabled'\)/);
 assert.match(settings,/element.getClientRects\(\).length > 0/);
 assert.match(settings,/event.shiftKey \? document.activeElement === first : document.activeElement === last/);
 assert.match(settings,/\(event.shiftKey \? last : first\).focus\(\)/);
 assert.match(settings,/const authChanged = \(\) => close\(true\)/);
 assert.match(settings,/addEventListener\('barticket-auth', authChanged, true\)/);
 assert.match(settings,/removeEventListener\('barticket-auth', authChanged, true\)/);
});
