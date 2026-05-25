import os
from pathlib import Path

import humanize

CACHE_DIRS = [
    "~/Library/Containers/com.apple.mail/Data/Library/Caches",
    "~/Library/Caches/com.apple.mail",
]


def _dir_size(path):
    total = 0
    try:
        for dp, _, fnames in os.walk(str(path), followlinks=False):
            for f in fnames:
                try:
                    total += os.path.getsize(os.path.join(dp, f))
                except OSError:
                    pass
    except (PermissionError, OSError):
        pass
    return total


def scan_mail():
    items = []

    for root_raw in ["~/Library/Mail",
                     "~/Library/Containers/com.apple.mail/Data/Library/Mail"]:
        root = Path(root_raw).expanduser()
        if not root.exists():
            continue
        try:
            for dp, dirnames, _ in os.walk(str(root), followlinks=False):
                hits = [d for d in dirnames if d == "Attachments"]
                for d in hits:
                    att = os.path.join(dp, d)
                    size = _dir_size(att)
                    if size > 0:
                        items.append({
                            "path": att,
                            "name": "Mail Attachments",
                            "category": "Attachments",
                            "size": size,
                            "size_human": humanize.naturalsize(size, binary=True),
                            "type": "directory",
                        })
                dirnames[:] = [d for d in dirnames if d != "Attachments"]
        except (PermissionError, OSError):
            pass

    for raw in CACHE_DIRS:
        p = Path(raw).expanduser()
        if not p.exists():
            continue
        size = _dir_size(p)
        if size > 0:
            items.append({
                "path": str(p),
                "name": "Mail Cache",
                "category": "Cache",
                "size": size,
                "size_human": humanize.naturalsize(size, binary=True),
                "type": "directory",
            })

    items.sort(key=lambda x: x["size"], reverse=True)
    total = sum(i["size"] for i in items)
    return {"items": items, "count": len(items),
            "total": total, "total_human": humanize.naturalsize(total, binary=True)}
