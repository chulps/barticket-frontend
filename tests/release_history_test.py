import importlib.util
import io
import json
import tempfile
import tarfile
import unittest
import zipfile
from pathlib import Path
spec=importlib.util.spec_from_file_location('history', 'scripts/prepare-release-history.py')
history=importlib.util.module_from_spec(spec)
spec.loader.exec_module(history)

def row(run='1:1', sha='a'*40, date='2026-11-02T13:00:00Z'):
    return {'id':run,'sha':sha,'builtAt':date}
def archive(path, entries=None, name='release-history.json'):
    tarbytes=io.BytesIO()
    with tarfile.open(fileobj=tarbytes,mode='w') as tar:
        data=json.dumps({'schema':1,'releases':entries or []}).encode()
        item=tarfile.TarInfo(name);item.size=len(data);tar.addfile(item,io.BytesIO(data))
    with zipfile.ZipFile(path,'w') as z:z.writestr('artifact.tar',tarbytes.getvalue())
def sources(d, verified, live, sha='a'*40):
    d=Path(d)
    archive(d/'verified.zip',verified,name='release-history.json' if verified is not None else 'unrelated.json')
    (d/'source.json').write_text(json.dumps({'sha':sha}))
    if live is not None:(d/'live.json').write_text(json.dumps({'schema':1,'releases':live}))
    else:(d/'live-status.json').write_text('{"status":404}')
class HistoryTests(unittest.TestCase):
    def test_bootstrap_does_not_fabricate_old_releases(self):
        with tempfile.TemporaryDirectory() as d:
            sources(d,None,None,history.BOOTSTRAP_SHA)
            result=history.prepare(d,Path(d)/'out.json','2','1','b'*40,'2026-11-02T14:00:00Z')
            self.assertEqual([r['id'] for r in result['releases']],['2:1'])
    def test_retry_and_reload_do_not_duplicate(self):
        with tempfile.TemporaryDirectory() as d:
            sources(d,[row()],[row()])
            result=history.prepare(d,Path(d)/'out.json','1','1','a'*40,'2026-11-02T14:00:00Z')
            self.assertEqual(result['releases'],[row()])
    def test_revert_new_build_keeps_history(self):
        with tempfile.TemporaryDirectory() as d:
            sources(d,[row()],[row(),row('2:1','b'*40)])
            result=history.prepare(d,Path(d)/'out.json','3','1','a'*40,'2026-11-02T15:00:00Z')
            self.assertEqual({r['id'] for r in result['releases']},{'1:1','2:1','3:1'})
    def test_rollback_regression_is_blocked_not_silently_merged(self):
        with tempfile.TemporaryDirectory() as d:
            sources(d,[row(),row('2:1','b'*40)],[row()])
            with self.assertRaisesRegex(ValueError,'regressed'):history.prepare(d,Path(d)/'out.json','3','1','a'*40,'2026-11-02T15:00:00Z')
    def test_failed_candidate_is_not_source_for_next_release(self):
        with tempfile.TemporaryDirectory() as d:
            sources(d,[row()],[row()])
            history.prepare(d,Path(d)/'failed-candidate.json','2','1','b'*40,'2026-11-02T14:00:00Z')
            result=history.prepare(d,Path(d)/'out.json','3','1','c'*40,'2026-11-02T15:00:00Z')
            self.assertNotIn('2:1',[r['id'] for r in result['releases']])
    def test_missing_or_conflicting_postrollout_history_fails(self):
        for verified,live in [([row()],None),(None,[row()]),([row()],[row(sha='b'*40)]),([row()],[])]:
            with tempfile.TemporaryDirectory() as d:
                sources(d,verified,live)
                with self.assertRaises(ValueError):history.prepare(d,Path(d)/'out.json','3','1','c'*40,'2026-11-02T15:00:00Z')
    def test_malformed_and_oversized_history_fails(self):
        with self.assertRaises(ValueError):history.validate({'schema':1,'releases':[row(date='2026-02-31T00:00:00Z')]})
        with self.assertRaises(ValueError):history.validate({'schema':1,'releases':[row()]*10001})
        with self.assertRaises(ValueError):history.validate({'schema':1,'releases':[row(),row(sha='b'*40)]})
    def test_archive_path_does_not_extract_arbitrary_files(self):
        with tempfile.TemporaryDirectory() as d:
            archive(Path(d)/'old.zip',name='../release-history.json')
            self.assertEqual(history.read_archive(Path(d)/'old.zip'),{})
            self.assertFalse((Path(d)/'release-history.json').exists())
if __name__=='__main__':unittest.main()
