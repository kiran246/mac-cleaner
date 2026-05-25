import glob
import os
from pathlib import Path

import humanize

BROWSERS = [
    ("Chrome",  ["~/Library/Caches/Google/Chrome",
                 "~/Library/Application Support/Google/Chrome/Default/Cache",
                 "~/Library/Application Support/Google/Chrome/Default/Code Cache"]),
    ("Safari",  ["~/Library/Caches/com.apple.Safari",
                 "~/Library/Caches/com.apple.WebKit.WebContent"]),
    ("Firefox", ["~/Library/Caches/Firefox"]),
    ("Arc",     ["~/Library/Caches/company.thebrowser.Browser"]),
    ("Brave",   ["~/Library/Application Support/BraveSoftware/Brave-Browser/Default/Cache"]),
    ("Edge",    ["~/Library/Application Support/Microsoft Edge/Default/Cache"]),
    ("Opera",   ["~/Library/Caches/com.operasoftware.Opera"]),
]

# Firefox profile caches via glob
FIREFOX_PROFILE_GLOB = "~/Library/Application Support/Firefox/Profiles/*/cache2"


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


def scan_browsers():
    items = []

    for browser, paths in BROWSERS:
        size = 0
        found = []
        for raw in paths:
            p = Path(raw).expanduser()
            if p.exists():
                s = _dir_size(p)
                if s > 0:
                    size += s
                    found.append(str(p))
        if size > 0:
            items.append({
                "path": found[0],
                "name": f"{browser} Cache",
                "category": browser,
                "size": size,
                "size_human": humanize.naturalsize(size, binary=True),
                "type": "directory",
            })

    # Firefox profile caches
    ff_size = 0
    ff_paths = []
    for raw in glob.glob(os.path.expanduser(FIREFOX_PROFILE_GLOB)):
        s = _dir_size(raw)
        if s > 0:
            ff_size += s
            ff_paths.append(raw)
    if ff_size > 0:
        # Merge into Firefox item if it exists, else create
        for item in items:
            if item["category"] == "Firefox":
                item["size"] += ff_size
                item["size_human"] = humanize.naturalsize(item["size"], binary=True)
                break
        else:
            items.append({
                "path": ff_paths[0],
                "name": "Firefox Cache",
                "category": "Firefox",
                "size": ff_size,
                "size_human": humanize.naturalsize(ff_size, binary=True),
                "type": "directory",
            })

    items.sort(key=lambda x: x["size"], reverse=True)
    total = sum(i["size"] for i in items)
    return {"items": items, "count": len(items),
            "total": total, "total_human": humanize.naturalsize(total, binary=True)}
