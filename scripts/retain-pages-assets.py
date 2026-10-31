"""Merge only immutable public assets from the last successful Pages artifact.
No HTML, worker, manifest, API data, symlinks or arbitrary archive paths survive.
The ZIP is downloaded by the authenticated Actions API, never from a PR URL.
"""
import io
import json
import re
import sys
import tarfile
import time
import zipfile
from pathlib import Path

WINDOW = 30 * 24 * 60 * 60
ASSET = re.compile(r"assets/[A-Za-z0-9_./-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|png|svg|webp|jpg|jpeg|gif|woff|woff2|ttf|ico|avif)$")

def retain(archive, destination, now=None, fallback_seen=None, ledger=None):
    now = int(time.time() if now is None else now)
    destination = Path(destination)
    if ledger is None:
        ledger = {str(p.relative_to(destination)): now for p in (destination / "assets").rglob("*") if p.is_file()}
    with zipfile.ZipFile(archive) as bundle:
        with tarfile.open(fileobj=io.BytesIO(bundle.read("artifact.tar"))) as tar:
            members = {m.name.removeprefix("./"): m for m in tar.getmembers() if m.isfile()}
            old = {}
            if "asset-retention.json" in members:
                old = json.load(tar.extractfile(members["asset-retention.json"]))
            for name, member in members.items():
                if not ASSET.fullmatch(name) or ".." in name.split("/") or name in ledger:
                    continue
                # Bootstrap existing deployed assets once; thereafter retain the
                # original last-current timestamp, not the latest copy date.
                seen = old.get(name, now if fallback_seen is None else fallback_seen)
                if not isinstance(seen, (int, float)) or not 0 <= now - seen <= WINDOW:
                    continue
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())
                ledger[name] = seen
    (destination / "asset-retention.json").write_text(json.dumps(ledger, sort_keys=True) + "\n")
    return ledger

if __name__ == "__main__":
    source = Path(sys.argv[1])
    ledger = None
    for item in json.loads((source / "archives.json").read_text()):
        ledger = retain(source / item["file"], sys.argv[2], fallback_seen=item["created"], ledger=ledger)
