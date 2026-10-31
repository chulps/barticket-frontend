import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerBarTicketWorker } from './api/push'
import { dispatchBarTicketPush } from './api/pushEvents'
import { installNotificationSounds } from './api/notificationSounds'
import { installNotificationReturn } from './api/notificationNavigation'

installNotificationReturn()
installNotificationSounds()

if (import.meta.env.PROD) {
  void registerBarTicketWorker().catch((error) => console.warn('Service worker registration failed', error))
  navigator.serviceWorker.addEventListener('message', (event) => {
    const source = event.source as ServiceWorker | null
    const workerUrl = new URL('sw.js', new URL(import.meta.env.BASE_URL, location.origin)).href
    if (source?.scriptURL === workerUrl) dispatchBarTicketPush(event.data, window)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

