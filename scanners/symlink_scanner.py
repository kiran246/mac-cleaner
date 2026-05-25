import os
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", ".Trash",
             "Library/Developer/CoreSimulator", "Library/Developer/Xcode"}


def _should_skip(rel):
    return any(rel.startswith(s) or rel == s for s in SKIP_DIRS)


def scan_broken_symlinks(scan_path="~"):
    base = Path(scan_path).expanduser()
    items = []

    for dirpath, dirnames, filenames in os.walk(str(base), followlinks=False):
        rel = os.path.relpath(dirpath, base)
        if _should_skip(rel):
            dirnames.clear()
            continue
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]

        for name in filenames + dirnames:
            full = os.path.join(dirpath, name)
            try:
                if os.path.islink(full) and not os.path.exists(full):
                    target = os.readlink(full)
                    items.append({
                        "path": full,
                        "name": name,
                        "target": target,
                        "size": 0,
                        "size_human": "0 B",
                        "type": "symlink",
                    })
            except OSError:
                pass

        if len(items) >= 500:
            break

    return {"items": items, "count": len(items), "total": 0, "total_human": "0 B"}


def scan_empty_folders(scan_path="~"):
    base = Path(scan_path).expanduser()
    items = []

    for dirpath, dirnames, filenames in os.walk(str(base), followlinks=False,
                                                 topdown=False):
        rel = os.path.relpath(dirpath, base)
        if rel == "." or _should_skip(rel):
            dirnames.clear()
            continue
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]

        try:
            contents = os.listdir(dirpath)
        except (PermissionError, OSError):
            continue

        if not contents:
            items.append({
                "path": dirpath,
                "name": os.path.basename(dirpath),
                "size": 0,
                "size_human": "0 B",
                "type": "directory",
            })

        if len(items) >= 500:
            break

    return {"items": items, "count": len(items), "total": 0, "total_human": "0 B"}
