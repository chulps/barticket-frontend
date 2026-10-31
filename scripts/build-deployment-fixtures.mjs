import { build } from 'vite';
import { execFileSync } from 'node:child_process';
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

// Exercise the production ZIP/tar retention implementation, not a server fallback.
execFileSync('python3', ['-c', `
import io,json,shutil,subprocess,tarfile,tempfile,time,zipfile
from pathlib import Path
root=Path('.deployment-build'); target=root/'retained-b'
if target.exists(): shutil.rmtree(target)
shutil.copytree(root/'safe-b',target)
with tempfile.TemporaryDirectory() as temporary:
 folder=Path(temporary); data=io.BytesIO()
 with tarfile.open(fileobj=data,mode='w') as tar: tar.add(root/'legacy-unguarded',arcname='.')
 with zipfile.ZipFile(folder/'old.zip','w') as archive: archive.writestr('artifact.tar',data.getvalue())
 (folder/'archives.json').write_text(json.dumps([{'file':'old.zip','retired':int(time.time())}]))
 subprocess.run(['python3','scripts/retain-pages-assets.py',str(folder),str(target)],check=True)
`], { stdio: 'inherit' });
