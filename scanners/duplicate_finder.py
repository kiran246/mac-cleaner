import hashlib
import os
from collections import defaultdict
from pathlib import Path

import humanize


def _md5(path: str):
    h = hashlib.md5()
    try:
        with open(path, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)
        return h.hexdigest()
    except OSError:
        return None


def find_duplicates(scan_path: str) -> dict:
    base = Path(scan_path).expanduser()

    by_size: dict[int, list[str]] = defaultdict(list)

    for dirpath, dirnames, filenames in os.walk(base, followlinks=False):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            try:
                size = os.path.getsize(fpath)
                if size > 0:
                    by_size[size].append(fpath)
            except OSError:
                pass

    by_hash: dict[tuple, list[str]] = defaultdict(list)
    for size, paths in by_size.items():
        if len(paths) < 2:
            continue
        for fpath in paths:
            digest = _md5(fpath)
            if digest:
                by_hash[(size, digest)].append(fpath)

    groups = []
    total_wasted = 0
    for (size, digest), paths in by_hash.items():
        if len(paths) < 2:
            continue
        wasted = size * (len(paths) - 1)
        total_wasted += wasted
        groups.append(
            {
                "hash": digest,
                "size": size,
                "size_human": humanize.naturalsize(size, binary=True),
                "count": len(paths),
                "wasted": wasted,
                "wasted_human": humanize.naturalsize(wasted, binary=True),
                "files": [{"path": p, "name": os.path.basename(p)} for p in paths],
            }
        )

    groups.sort(key=lambda x: x["wasted"], reverse=True)
    return {
        "groups": groups[:200],
        "total_groups": len(groups),
        "total_wasted": total_wasted,
        "total_wasted_human": humanize.naturalsize(total_wasted, binary=True),
        "scan_path": str(base),
    }
