import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerBarTicketWorker } from './api/push'
import { dispatchBarTicketPush } from './api/pushEvents'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  void registerBarTicketWorker().catch((error) => console.warn('Service worker registration failed', error))
  navigator.serviceWorker.addEventListener('message', (event) => {
    dispatchBarTicketPush(event.data, window)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
