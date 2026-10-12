import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerBarTicketWorker } from './api/push'

if (import.meta.env.PROD) {
  void registerBarTicketWorker().catch((error) => console.warn('Service worker registration failed', error))
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
