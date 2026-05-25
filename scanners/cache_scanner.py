import os
from pathlib import Path

import humanize

CACHE_ROOTS = [
    "~/Library/Caches",
    "~/Library/Logs",
]


def _dir_size(path: Path) -> int:
    total = 0
    try:
        for dirpath, _, filenames in os.walk(path, followlinks=False):
            for fname in filenames:
                try:
                    total += os.path.getsize(os.path.join(dirpath, fname))
                except OSError:
                    pass
    except (PermissionError, OSError):
        pass
    return total


def scan_caches() -> dict:
    items = []

    for raw in CACHE_ROOTS:
        base = Path(raw).expanduser()
        if not base.exists():
            continue

        try:
            children = [c for c in base.iterdir() if not c.name.startswith(".")]
        except (PermissionError, OSError):
            continue

        for child in sorted(children, key=lambda p: p.name):
            try:
                if child.is_symlink():
                    continue
                if child.is_dir():
                    size = _dir_size(child)
                    kind = "directory"
                elif child.is_file():
                    size = child.stat().st_size
                    kind = "file"
                else:
                    continue
            except OSError:
                continue

            if size == 0:
                continue

            items.append(
                {
                    "path": str(child),
                    "name": child.name,
                    "category": base.name,
                    "size": size,
                    "size_human": humanize.naturalsize(size, binary=True),
                    "type": kind,
                }
            )

    items.sort(key=lambda x: x["size"], reverse=True)
    total = sum(i["size"] for i in items)
    return {
        "items": items,
        "count": len(items),
        "total": total,
        "total_human": humanize.naturalsize(total, binary=True),
    }
