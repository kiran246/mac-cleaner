import os
import re
import subprocess
from pathlib import Path

import humanize

PRIVACY_ITEMS = [
    {
        "key": "safari_history",
        "name": "Safari History",
        "category": "Safari",
        "description": "Browser history database",
        "paths": [
            "~/Library/Safari/History.db",
            "~/Library/Safari/History.db-shm",
            "~/Library/Safari/History.db-wal",
        ],
    },
    {
        "key": "safari_cookies",
        "name": "Safari Cookies",
        "category": "Safari",
        "description": "Website login and tracking cookies",
        "paths": ["~/Library/Cookies/Cookies.binarycookies"],
    },
    {
        "key": "safari_downloads",
        "name": "Safari Downloads List",
        "category": "Safari",
        "description": "Record of files downloaded via Safari",
        "paths": ["~/Library/Safari/Downloads.plist"],
    },
    {
        "key": "chrome_history",
        "name": "Chrome History",
        "category": "Chrome",
        "description": "Browser history database",
        "paths": [
            "~/Library/Application Support/Google/Chrome/Default/History",
            "~/Library/Application Support/Google/Chrome/Default/History-journal",
        ],
    },
    {
        "key": "chrome_cookies",
        "name": "Chrome Cookies",
        "category": "Chrome",
        "description": "Website cookies",
        "paths": ["~/Library/Application Support/Google/Chrome/Default/Cookies"],
    },
    {
        "key": "recent_docs",
        "name": "Recent Documents",
        "category": "System",
        "description": "macOS recent files and apps lists",
        "paths": ["~/Library/Application Support/com.apple.sharedfilelist"],
        "is_dir": True,
    },
    {
        "key": "quicklook_cache",
        "name": "QuickLook Cache",
        "category": "System",
        "description": "Thumbnail previews cached by Quick Look",
        "paths": [],
        "dynamic": "quicklook",
    },
]


def _file_size(p):
    try:
        return os.path.getsize(str(p))
    except OSError:
        return 0


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


def _quicklook_cache_path():
    try:
        base = subprocess.run(
            ["getconf", "DARWIN_USER_CACHE_DIR"],
            capture_output=True, text=True, timeout=5
        ).stdout.strip()
        return os.path.join(base, "com.apple.quicklook.ThumbnailsAgent",
                            "com.apple.QuickLook.thumbnailcache")
    except Exception:
        return None


def scan_privacy():
    items = []

    for spec in PRIVACY_ITEMS:
        paths = list(spec["paths"])

        if spec.get("dynamic") == "quicklook":
            ql = _quicklook_cache_path()
            if ql:
                paths = [ql]

        total_size = 0
        found_paths = []
        is_dir = spec.get("is_dir", False)

        for raw in paths:
            p = Path(raw).expanduser()
            try:
                exists = p.exists()
            except PermissionError:
                continue
            if not exists:
                continue
            if is_dir or p.is_dir():
                s = _dir_size(p)
            else:
                s = _file_size(p)
            if s > 0:
                total_size += s
                found_paths.append(str(p))

        if found_paths:
            items.append({
                "key": spec["key"],
                "name": spec["name"],
                "category": spec["category"],
                "description": spec["description"],
                "path": found_paths[0],
                "all_paths": found_paths,
                "size": total_size,
                "size_human": humanize.naturalsize(total_size, binary=True),
                "type": "directory" if is_dir else "file",
            })

    items.sort(key=lambda x: x["size"], reverse=True)
    total = sum(i["size"] for i in items)
    return {"items": items, "count": len(items),
            "total": total, "total_human": humanize.naturalsize(total, binary=True)}


def get_network_connections():
    try:
        out = subprocess.run(
            ["lsof", "-i", "-n", "-P"],
            capture_output=True, text=True, timeout=10
        ).stdout
    except Exception as e:
        return {"connections": [], "count": 0, "error": str(e)}

    by_process = {}
    for line in out.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 9:
            continue
        proc = parts[0]
        pid = parts[1]
        name_col = parts[-1]

        state = ""
        m = re.search(r"\((\w+)\)$", name_col)
        if m:
            state = m.group(1)
            addr = name_col[:m.start()].strip()
        else:
            addr = name_col

        if state not in ("ESTABLISHED", "LISTEN"):
            continue

        local, remote = addr, None
        if "->" in addr:
            local, remote = addr.split("->", 1)

        key = f"{proc}:{pid}"
        if key not in by_process:
            by_process[key] = {"process": proc, "pid": pid, "connections": []}
        by_process[key]["connections"].append({
            "local": local,
            "remote": remote,
            "state": state,
        })

    result = sorted(by_process.values(),
                    key=lambda x: len(x["connections"]), reverse=True)
    return {"connections": result[:60], "count": len(result)}
