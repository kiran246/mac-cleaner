import os
import plistlib
from datetime import datetime
from pathlib import Path

import humanize

BACKUP_ROOT = Path("~/Library/Application Support/MobileSync/Backup").expanduser()


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


def _read_plist(path):
    try:
        with open(str(path), "rb") as f:
            return plistlib.load(f)
    except Exception:
        return {}


def scan_ios_backups():
    if not BACKUP_ROOT.exists():
        return {"items": [], "count": 0, "total": 0, "total_human": "0 B"}

    items = []
    for entry in BACKUP_ROOT.iterdir():
        if not entry.is_dir():
            continue
        info = _read_plist(entry / "Info.plist")
        device_name = (info.get("Display Name") or
                       info.get("Device Name") or
                       "Unknown Device")
        product = info.get("Product Type", "")
        last_backup = info.get("Last Backup Date")
        if isinstance(last_backup, datetime):
            last_backup = last_backup.strftime("%Y-%m-%d")
        else:
            last_backup = str(last_backup) if last_backup else "Unknown"

        size = _dir_size(entry)
        if size == 0:
            continue

        items.append({
            "path": str(entry),
            "name": device_name,
            "product_type": product,
            "last_backup": last_backup,
            "size": size,
            "size_human": humanize.naturalsize(size, binary=True),
            "type": "directory",
        })

    items.sort(key=lambda x: x["size"], reverse=True)
    total = sum(i["size"] for i in items)
    return {"items": items, "count": len(items),
            "total": total, "total_human": humanize.naturalsize(total, binary=True)}
