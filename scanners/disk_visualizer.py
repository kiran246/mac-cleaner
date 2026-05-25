import os
from collections import defaultdict
from pathlib import Path

import humanize

SKIP_DIRS = {".git", ".Trash", "node_modules"}


def get_disk_usage(scan_path: str, depth: int = 2) -> dict:
    base = Path(scan_path).expanduser().resolve()

    # Single os.walk pass to get per-directory direct file sizes
    dir_file_bytes: dict[str, int] = defaultdict(int)
    try:
        for dirpath, dirnames, filenames in os.walk(str(base), followlinks=False):
            dirnames[:] = [
                d for d in dirnames
                if not d.startswith(".") and d not in SKIP_DIRS
            ]
            for fname in filenames:
                try:
                    dir_file_bytes[dirpath] += os.path.getsize(
                        os.path.join(dirpath, fname)
                    )
                except OSError:
                    pass
    except (PermissionError, OSError):
        pass

    def build_node(path: str, current_depth: int) -> dict:
        direct = dir_file_bytes.get(path, 0)
        children = []

        if current_depth < depth:
            try:
                subdirs = [
                    e.path
                    for e in os.scandir(path)
                    if e.is_dir(follow_symlinks=False)
                    and not e.name.startswith(".")
                    and e.name not in SKIP_DIRS
                ]
            except (PermissionError, OSError):
                subdirs = []

            for subdir in subdirs:
                child = build_node(subdir, current_depth + 1)
                if child["size"] > 0:
                    children.append(child)
        else:
            prefix = path + os.sep
            for dpath, dsize in dir_file_bytes.items():
                if dpath.startswith(prefix):
                    direct += dsize

        children.sort(key=lambda x: x["size"], reverse=True)
        total = direct + sum(c["size"] for c in children)
        p = Path(path)

        return {
            "name": p.name or str(p),
            "path": path,
            "size": total,
            "size_human": humanize.naturalsize(total, binary=True),
            "children": children[:40],
        }

    return build_node(str(base), 0)
