import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the site from /<repo-name>/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  // Public sourcemaps would expose application source and implementation detail.
  build: { sourcemap: false },
})
