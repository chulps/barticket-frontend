import { useSyncExternalStore } from 'react';
import { getActivitySnapshot, subscribeActivity } from '../api/notificationActivityStore';
/** Current-shift socket state only: no REST, polling, push subscription or sound. */
export function useNotificationActivity() {return useSyncExternalStore(subscribeActivity,getActivitySnapshot,getActivitySnapshot);}
