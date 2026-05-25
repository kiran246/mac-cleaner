import os
import subprocess
from datetime import datetime
from pathlib import Path

import humanize

APP_DIRS = ["/Applications", str(Path("~/Applications").expanduser())]

LEFTOVER_DIRS = [
    "~/Library/Application Support",
    "~/Library/Preferences",
    "~/Library/Caches",
    "~/Library/Logs",
    "~/Library/Saved Application State",
    "~/Library/Containers",
    "~/Library/HTTPStorages",
    "~/Library/WebKit",
    "~/Library/Cookies",
]


def _dir_size(path):
    try:
        out = subprocess.run(
            ["du", "-sk", path],
            capture_output=True, text=True, timeout=30
        ).stdout
        return int(out.split()[0]) * 1024
    except Exception:
        pass
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


def _mdls(app_path):
    keys = ["kMDItemCFBundleIdentifier", "kMDItemLastUsedDate"]
    try:
        out = subprocess.run(
            ["mdls", "-name"] + sum([[k] for k in keys], []) + [app_path],
            capture_output=True, text=True, timeout=10
        ).stdout
    except Exception:
        return {}, {}
    result = {}
    for line in out.splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            result[k.strip()] = v.strip().strip('"')
    return result


def scan_apps():
    now = datetime.now().timestamp()
    apps = []

    for app_dir in APP_DIRS:
        if not os.path.exists(app_dir):
            continue
        try:
            for entry in os.scandir(app_dir):
                if not entry.name.endswith(".app"):
                    continue
                meta = _mdls(entry.path)
                bundle_id = meta.get("kMDItemCFBundleIdentifier", "")
                if bundle_id in ("(null)", ""):
                    bundle_id = ""

                last_used_str = meta.get("kMDItemLastUsedDate", "")
                last_used = None
                days_since = None
                if last_used_str and last_used_str != "(null)":
                    try:
                        dt = datetime.strptime(last_used_str[:19], "%Y-%m-%d %H:%M:%S")
                        last_used = dt.strftime("%Y-%m-%d")
                        days_since = int((now - dt.timestamp()) / 86400)
                    except ValueError:
                        pass

                size = _dir_size(entry.path)
                apps.append({
                    "path": entry.path,
                    "name": entry.name.replace(".app", ""),
                    "bundle_id": bundle_id,
                    "size": size,
                    "size_human": humanize.naturalsize(size, binary=True),
                    "last_used": last_used,
                    "days_since_use": days_since,
                    "type": "app",
                })
        except (PermissionError, OSError):
            pass

    apps.sort(key=lambda x: x["size"], reverse=True)
    total = sum(a["size"] for a in apps)
    return {"items": apps, "count": len(apps),
            "total": total, "total_human": humanize.naturalsize(total, binary=True)}


def find_app_leftovers(bundle_id, app_name):
    tokens = set()
    if bundle_id:
        tokens.add(bundle_id.lower())
        parts = bundle_id.lower().split(".")
        if len(parts) >= 3:
            tokens.add(".".join(parts[:3]))
    if app_name:
        tokens.add(app_name.lower().replace(" ", ""))
        tokens.add(app_name.lower())

    leftovers = []
    for raw in LEFTOVER_DIRS:
        d = Path(raw).expanduser()
        if not d.exists():
            continue
        try:
            for entry in d.iterdir():
                name_lower = entry.name.lower()
                if any(t in name_lower for t in tokens if len(t) > 3):
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            size = _dir_size(str(entry))
                            kind = "directory"
                        else:
                            size = entry.stat().st_size
                            kind = "file"
                        leftovers.append({
                            "path": str(entry),
                            "name": entry.name,
                            "subdirectory": d.name,
                            "size": size,
                            "size_human": humanize.naturalsize(size, binary=True),
                            "type": kind,
                        })
                    except OSError:
                        pass
        except (PermissionError, OSError):
            pass

    leftovers.sort(key=lambda x: x["size"], reverse=True)
    total = sum(f["size"] for f in leftovers)
    return {"leftovers": leftovers, "count": len(leftovers),
            "total": total, "total_human": humanize.naturalsize(total, binary=True)}
