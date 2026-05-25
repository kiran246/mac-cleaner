import fnmatch
import os
import time
from pathlib import Path

import humanize

SCREENSHOT_DIRS = [
    "~/Desktop",
    "~/Pictures/Screenshots",
]

PATTERNS = ["Screenshot*.png", "Screenshot*.jpg", "Simulator Screenshot*.png"]


def scan_screenshots():
    items = []
    now = time.time()

    for raw in SCREENSHOT_DIRS:
        base = Path(raw).expanduser()
        if not base.exists():
            continue

        if raw == "~/Desktop":
            try:
                for entry in base.iterdir():
                    if not entry.is_file():
                        continue
                    if any(fnmatch.fnmatch(entry.name, pat) for pat in PATTERNS):
                        try:
                            st = entry.stat()
                            items.append({
                                "path": str(entry),
                                "name": entry.name,
                                "category": "Desktop Screenshots",
                                "size": st.st_size,
                                "size_human": humanize.naturalsize(st.st_size, binary=True),
                                "days_old": int((now - st.st_mtime) / 86400),
                                "type": "file",
                            })
                        except OSError:
                            pass
            except (PermissionError, OSError):
                pass
        else:
            # ~/Pictures/Screenshots — include all files
            try:
                for entry in base.iterdir():
                    if not entry.is_file():
                        continue
                    try:
                        st = entry.stat()
                        items.append({
                            "path": str(entry),
                            "name": entry.name,
                            "category": "Pictures/Screenshots",
                            "size": st.st_size,
                            "size_human": humanize.naturalsize(st.st_size, binary=True),
                            "days_old": int((now - st.st_mtime) / 86400),
                            "type": "file",
                        })
                    except OSError:
                        pass
            except (PermissionError, OSError):
                pass

    items.sort(key=lambda x: x["size"], reverse=True)
    total = sum(i["size"] for i in items)
    return {"items": items, "count": len(items),
            "total": total, "total_human": humanize.naturalsize(total, binary=True)}
