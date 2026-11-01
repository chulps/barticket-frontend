import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const settings=readFileSync('src/components/NotificationSettings.tsx','utf8');
const page=readFileSync('src/pages/Notifications.tsx','utf8');
const preferences=readFileSync('src/components/NotificationPreferences.tsx','utf8');
test('one heading settings action owns all three mounted panels, not the notification feed',()=>{
 assert.match(page,/<HeadingRow><Heading>.*?<\/Heading><NotificationSettings \/><\/HeadingRow>/);
 assert.match(settings,/hidden=\{!open\}/);
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
 assert.match(settings,/trigger.current\?\.focus/);
 assert.match(settings,/max-height: 70dvh/);
 assert.match(settings,/overflow-y: auto; overscroll-behavior: contain/);
 assert.doesNotMatch(settings,/role="menu"/);
});
