import os
import time
from datetime import datetime
from pathlib import Path

import humanize

ARCHIVE_EXTS = {".dmg", ".zip", ".pkg", ".tar", ".gz", ".bz2", ".7z", ".rar", ".iso"}
ARCHIVE_SEARCH_DIRS = ["~/Downloads", "~/Desktop"]


def _item_size(path):
    if os.path.isfile(path):
        try:
            return os.path.getsize(path)
        except OSError:
            return 0
    total = 0
    try:
        for dp, _, fnames in os.walk(path, followlinks=False):
            for f in fnames:
                try:
                    total += os.path.getsize(os.path.join(dp, f))
                except OSError:
                    pass
    except (PermissionError, OSError):
        pass
    return total


def scan_trash():
    items = []
    now = time.time()

    # Main trash — each top-level item is one entry
    trash = Path("~/.Trash").expanduser()
    if trash.exists():
        try:
            for entry in trash.iterdir():
                size = _item_size(str(entry))
                try:
                    days_old = int((now - entry.stat().st_mtime) / 86400)
                except OSError:
                    days_old = 0
                items.append({
                    "path": str(entry),
                    "name": entry.name,
                    "category": "Trash",
                    "size": size,
                    "size_human": humanize.naturalsize(size, binary=True),
                    "days_old": days_old,
                    "type": "directory" if entry.is_dir() else "file",
                })
        except (PermissionError, OSError):
            pass

    # External volume trash
    try:
        uid = os.getuid()
        for vol in Path("/Volumes").iterdir():
            vol_trash = vol / ".Trashes" / str(uid)
            if vol_trash.exists():
                try:
                    for entry in vol_trash.iterdir():
                        size = _item_size(str(entry))
                        items.append({
                            "path": str(entry),
                            "name": entry.name,
                            "category": f"Trash ({vol.name})",
                            "size": size,
                            "size_human": humanize.naturalsize(size, binary=True),
                            "days_old": 0,
                            "type": "directory" if entry.is_dir() else "file",
                        })
                except (PermissionError, OSError):
                    pass
    except (PermissionError, OSError):
        pass

    # Old archives in Downloads / Desktop
    for raw in ARCHIVE_SEARCH_DIRS:
        search = Path(raw).expanduser()
        if not search.exists():
            continue
        try:
            for entry in search.iterdir():
                if not entry.is_file():
                    continue
                suffix = "".join(entry.suffixes[-2:]).lower() or entry.suffix.lower()
                if not any(suffix.endswith(ext) for ext in ARCHIVE_EXTS):
                    continue
                try:
                    st = entry.stat()
                    size = st.st_size
                    days_old = int((now - st.st_mtime) / 86400)
                    items.append({
                        "path": str(entry),
                        "name": entry.name,
                        "category": "Old Archives",
                        "size": size,
                        "size_human": humanize.naturalsize(size, binary=True),
                        "days_old": days_old,
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
