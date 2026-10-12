import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerBarTicketWorker } from './api/push'

if (import.meta.env.PROD) {
  void registerBarTicketWorker().catch((error) => console.warn('Service worker registration failed', error))
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'barticket-push') {
      window.dispatchEvent(new Event('barticket-push'))
      window.dispatchEvent(new Event('barticket-notices'))
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
