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
MAX_BYTES = 200 * 1024 * 1024  # Fail closed; never evict still-valid assets to fit.
ASSET = re.compile(r"assets/[A-Za-z0-9_./-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|png|svg|webp|jpg|jpeg|gif|woff|woff2|ttf|ico|avif)$")

def retain(archive, destination, now=None, fallback_seen=None, ledger=None):
    now = int(time.time() if now is None else now)
    destination = Path(destination)
    if ledger is None:
        ledger = {"current": sorted(str(p.relative_to(destination)) for p in (destination / "assets").rglob("*") if p.is_file()), "retired": {}}
    total_bytes = sum(p.stat().st_size for p in (destination / "assets").rglob("*") if p.is_file())
    if total_bytes > MAX_BYTES:
        raise RuntimeError("Public asset continuity exceeds the 200 MiB release budget")
    with zipfile.ZipFile(archive) as bundle:
        with tarfile.open(fileobj=io.BytesIO(bundle.read("artifact.tar"))) as tar:
            members = {m.name.removeprefix("./"): m for m in tar.getmembers() if m.isfile()}
            old = {}
            if "asset-retention.json" in members:
                old = json.load(tar.extractfile(members["asset-retention.json"]))
            for name, member in members.items():
                if not ASSET.fullmatch(name) or any(part in ("", ".", "..") for part in name.split("/")) or name in ledger["current"] or name in ledger["retired"]:
                    continue
                # Retire the previously current version NOW, even if it had been
                # served unchanged for months. Only already-retired assets keep
                # their original expiry; copying cannot extend their lifetime.
                retired_at = now if fallback_seen is None else fallback_seen
                seen = retired_at if name in old.get("current", []) else old.get("retired", {}).get(name, retired_at)
                if not isinstance(seen, (int, float)) or not 0 <= now - seen <= WINDOW:
                    continue
                if total_bytes + member.size > MAX_BYTES:
                    raise RuntimeError("Public asset continuity exceeds the 200 MiB release budget")
                total_bytes += member.size
                target = destination / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(tar.extractfile(member).read())
                ledger["retired"][name] = seen
    (destination / "asset-retention.json").write_text(json.dumps(ledger, sort_keys=True) + "\n")
    return ledger

if __name__ == "__main__":
    source = Path(sys.argv[1])
    ledger = None
    for item in json.loads((source / "archives.json").read_text()):
        ledger = retain(source / item["file"], sys.argv[2], fallback_seen=item["retired"], ledger=ledger)
