"""Carry public release records ONLY from successful production Pages artifacts.
Candidate records become public atomically with the deployment, never on CI start.
No arbitrary archive extraction, network access, credentials, or business data.
"""
import io
import json
import os
import re
import sys
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

MAX_BYTES = 2 * 1024 * 1024
MAX_RECORDS = 10000
BOOTSTRAP_SHA = "6381501fce8c9b9f2ec41976598f67eea2733457"

def validate(value):
    if not isinstance(value, dict) or set(value) != {'schema', 'releases'} or value['schema'] != 1 or not isinstance(value['releases'], list):
        raise ValueError('Invalid release history schema; recover a verified production ledger')
    if len(value['releases']) > MAX_RECORDS:
        raise ValueError('Release history limit reached; archive with an explicit migration, never truncate')
    result = {}
    for entry in value['releases']:
        if not isinstance(entry, dict) or set(entry) != {'id', 'sha', 'builtAt'}:
            raise ValueError('Invalid release record fields')
        if not isinstance(entry['id'], str) or not re.fullmatch(r'[1-9][0-9]*:[1-9][0-9]*', entry['id']):
            raise ValueError('Invalid release identity')
        if not isinstance(entry['sha'], str) or not re.fullmatch(r'[a-f0-9]{40}', entry['sha']):
            raise ValueError('Invalid release SHA')
        if not isinstance(entry['builtAt'], str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ', entry['builtAt']):
            raise ValueError('Invalid build date')
        datetime.strptime(entry['builtAt'], '%Y-%m-%dT%H:%M:%SZ')
        if entry['id'] in result and result[entry['id']] != entry:
            raise ValueError('Conflicting release identity; recover verified history')
        result[entry['id']] = entry
    return result

def read_archive(path):
    with zipfile.ZipFile(path) as bundle:
        with tarfile.open(fileobj=io.BytesIO(bundle.read('artifact.tar'))) as tar:
            matches = [m for m in tar.getmembers() if m.name.removeprefix('./') == 'release-history.json']
            if not matches:
                return {}  # First rollout: no invented pre-feature history.
            if len(matches) != 1 or not matches[0].isfile() or matches[0].size > MAX_BYTES:
                raise ValueError('Unsafe or oversized production release ledger')
            return validate(json.load(tar.extractfile(matches[0])))

def prepare(source, destination, run_id, attempt, sha, built_at):
    source = Path(source)
    verified = read_archive(source / 'verified.zip')
    source_sha = json.loads((source / 'source.json').read_text())['sha']
    live_path = source / 'live.json'
    if live_path.exists():
        if live_path.stat().st_size > MAX_BYTES:
            raise ValueError('Live release history exceeds size budget')
        records = validate(json.loads(live_path.read_text()))
        if not records:
            raise ValueError('Published release history is unexpectedly empty')
        for identity, entry in verified.items():
            if records.get(identity) != entry:
                raise ValueError('Published history regressed or differs from verified successful history; recover before deploying')
        if not verified and source_sha != BOOTSTRAP_SHA:
            raise ValueError('Verified source is missing post-rollout release history')
    else:
        status = json.loads((source / 'live-status.json').read_text())['status']
        if status != 404 or source_sha != BOOTSTRAP_SHA or verified:
            raise ValueError('Missing published release history after rollout; recover before deploying')
        records = {}
    candidate = {'id': f'{run_id}:{attempt}', 'sha': sha, 'builtAt': built_at}
    validate({'schema': 1, 'releases': [candidate]})
    # Reprocessing the same immutable build must not rewrite its first timestamp.
    if candidate['id'] in records:
        if records[candidate['id']]['sha'] != sha:
            raise ValueError('Release identity reused for a different commit')
    else:
        records[candidate['id']] = candidate
    value = {'schema': 1, 'releases': sorted(records.values(), key=lambda r: (r['builtAt'], r['id']), reverse=True)}
    validate(value)
    encoded = json.dumps(value, separators=(',', ':')) + '\n'
    if len(encoded.encode()) > MAX_BYTES:
        raise ValueError('Release history exceeds size budget; verified archive migration required')
    Path(destination).write_text(encoded)
    return value

if __name__ == '__main__':
    prepare(sys.argv[1], sys.argv[2], os.environ['GITHUB_RUN_ID'], os.environ['GITHUB_RUN_ATTEMPT'], os.environ['GITHUB_SHA'], datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
