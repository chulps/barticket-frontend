import { build } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
const path = 'src/App.tsx', original = readFileSync(path, 'utf8');
try {
  for (const version of ['safe-a', 'safe-b', 'legacy-guarded', 'legacy-unguarded']) {
    let source = original;
    if (version.startsWith('legacy')) {
      source = source.replace('Suspense, useState', 'lazy, Suspense, useState');
      for (const name of ['Admin', 'Analytics', 'Notifications', 'Receivables', 'Schedules']) {
        source = source.replace(`import ${name} from "./pages/${name}";`, `const ${name} = lazy(() => import("./pages/${name}"));`);
      }
    }
    if (version === 'legacy-unguarded') source = source.replace('import RouteErrorBoundary from "./components/RouteErrorBoundary";', '').replace('<RouteErrorBoundary>', '').replace('</RouteErrorBoundary>', '');
    writeFileSync(path, source);
    await build({ base: '/', build: { outDir: `.deployment-build/${version}`, rolldownOptions: { output: {
      entryFileNames: `assets/${version}-[name]-[hash].js`, chunkFileNames: `assets/${version}-[name]-[hash].js`,
    } } } });
  }
} finally { writeFileSync(path, original); }
