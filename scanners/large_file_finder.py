import os
import time
from datetime import datetime
from pathlib import Path

import humanize

SKIP_DIRS = {
    "Library/Developer/Xcode/DerivedData",
    "Library/Developer/CoreSimulator/Devices",
    ".Trash",
}


def find_large_files(min_mb: int = 100, days_old: int = 0) -> dict:
    home = Path("~").expanduser()
    min_bytes = min_mb * 1024 * 1024
    now = time.time()
    access_cutoff = now - (days_old * 86400) if days_old > 0 else 0

    results = []

    for dirpath, dirnames, filenames in os.walk(home, followlinks=False):
        rel = os.path.relpath(dirpath, home)
        if any(rel.startswith(skip) or rel == skip for skip in SKIP_DIRS):
            dirnames.clear()
            continue

        dirnames[:] = [d for d in dirnames if not d.startswith(".")]

        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            try:
                st = os.stat(fpath)
            except OSError:
                continue

            if st.st_size < min_bytes:
                continue
            if access_cutoff and st.st_atime > access_cutoff:
                continue

            results.append(
                {
                    "path": fpath,
                    "name": fname,
                    "size": st.st_size,
                    "size_human": humanize.naturalsize(st.st_size, binary=True),
                    "last_accessed": datetime.fromtimestamp(st.st_atime).strftime(
                        "%Y-%m-%d"
                    ),
                    "days_since_access": int((now - st.st_atime) / 86400),
                }
            )

    results.sort(key=lambda x: x["size"], reverse=True)
    total = sum(r["size"] for r in results)
    return {
        "items": results[:500],
        "count": len(results),
        "total": total,
        "total_human": humanize.naturalsize(total, binary=True),
        "params": {"min_mb": min_mb, "days_old": days_old},
    }
