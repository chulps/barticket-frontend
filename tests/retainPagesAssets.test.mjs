import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('retention copies only immutable public files, respects expiry and never overwrites current assets', () => {
  execFileSync('python3', ['-c', `
import importlib.util, io, json, tarfile, tempfile, zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('retain','scripts/retain-pages-assets.py'); mod=importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
with tempfile.TemporaryDirectory() as root:
 root=Path(root); dest=root/'dist'; (dest/'assets').mkdir(parents=True)
 (dest/'assets/new-abcdefgh.js').write_text('current')
 files={'assets/new-abcdefgh.js':'wrong','assets/old-abcdefgh.js':'old','assets/expired-abcdefgh.js':'expired','assets/source-abcdefgh.map':'private source','../assets/escape-abcdefgh.js':'escape','index.html':'old shell','sw.js':'old worker','api/tickets.json':'private','assets/unhashed.js':'wrong','asset-retention.json':json.dumps({'assets/old-abcdefgh.js':100,'assets/expired-abcdefgh.js':0})}
 tarbytes=io.BytesIO()
 with tarfile.open(fileobj=tarbytes,mode='w') as tar:
  for name,body in files.items():
   data=body.encode(); info=tarfile.TarInfo(name); info.size=len(data); tar.addfile(info,io.BytesIO(data))
  link=tarfile.TarInfo('assets/link-abcdefgh.js');link.type=tarfile.SYMTYPE;link.linkname='/etc/passwd';tar.addfile(link)
 archive=root/'previous.zip'
 with zipfile.ZipFile(archive,'w') as z:z.writestr('artifact.tar',tarbytes.getvalue())
 ledger=mod.retain(archive,dest,now=mod.WINDOW+1)
 assert (dest/'assets/new-abcdefgh.js').read_text()=='current'
 assert (dest/'assets/old-abcdefgh.js').read_text()=='old'
 assert ledger['assets/old-abcdefgh.js']==100
 assert sorted(p.name for p in (dest/'assets').iterdir())==['new-abcdefgh.js','old-abcdefgh.js']
 assert not (dest/'index.html').exists() and not (dest/'sw.js').exists()
 # Repeating retention does not extend the original timestamp.
 ledger=mod.retain(archive,dest,now=mod.WINDOW+2,ledger=ledger)
 assert ledger['assets/old-abcdefgh.js']==100
`], { stdio:'pipe' });
});

test('all routes are eager and containment never reloads or clears user state', () => {
 const app=readFileSync('src/App.tsx','utf8');
 assert.doesNotMatch(app,/lazy\(|import\("\.\/pages/);
 const boundary=readFileSync('src/components/RouteErrorBoundary.tsx','utf8');
 assert.doesNotMatch(boundary,/location\.reload|storage\.clear|localStorage|sessionStorage|setInterval|setTimeout/);
 assert.match(boundary,/key=\{pathname\}/);
 assert.ok(app.indexOf('</RouteErrorBoundary>')<app.indexOf('<ModalHost />'));
});
