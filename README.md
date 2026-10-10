# BarTicket Frontend

React + Vite frontend for [BarTicket-API](https://github.com/andrewmurphy-dev/BarTicket-API).

## Run locally

Start the backend first (see its README), then:

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Use `localhost`, not
`127.0.0.1`, so the browser origin is allowed by the backend's CORS settings.

The app calls `http://localhost:8000` by default. To use another backend, copy
`.env.example` to `.env.local` and set `VITE_API_URL`.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds and publishes the site on every push to
`main`. One-time setup by a repo admin:

1. **Settings → Pages → Build and deployment → Source:** select **GitHub Actions**.
   GitHub Pages on a private repo needs a paid GitHub plan; otherwise make the repo public.
2. **Settings → Secrets and variables → Actions → Variables:** add `VITE_API_URL`
   with the hosted backend URL. Without it, the live site calls `http://localhost:8000`,
   which only works on a machine running the backend.

The site is served at `https://<owner>.github.io/barticket-frontend/`. The backend
must list `https://<owner>.github.io` in `CORS_ORIGINS`.

---

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
