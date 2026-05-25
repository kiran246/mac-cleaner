import os
from pathlib import Path

import humanize

# (path, category, expand_children)
TARGETS = [
    ("~/Library/Developer/Xcode/DerivedData",        "DerivedData",       True),
    ("~/Library/Developer/Xcode/Archives",            "Archives",          True),
    ("~/Library/Developer/Xcode/iOS DeviceSupport",   "iOS DeviceSupport", True),
    ("~/Library/Developer/Xcode/watchOS DeviceSupport","watchOS Support",   True),
    ("~/Library/Developer/Xcode/tvOS DeviceSupport",  "tvOS Support",      True),
    ("~/Library/Developer/DVTDownloads",              "DVT Downloads",     False),
    ("~/Library/Developer/CoreSimulator/Devices",     "Simulators",        True),
    ("~/Library/Developer/CoreSimulator/Caches",      "Simulator Caches",  False),
    ("~/Library/Developer/CoreSimulator/Temp",        "Simulator Temp",    False),
    ("~/Library/Caches/com.apple.dt.Xcode",          "Xcode Cache",       False),
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


def scan_xcode():
    items = []
    for raw_path, category, expand in TARGETS:
        path = Path(raw_path).expanduser()
        if not path.exists():
            continue

        if expand:
            try:
                children = [c for c in path.iterdir()
                            if not c.name.startswith(".")]
            except (PermissionError, OSError):
                children = []
            for child in children:
                size = _dir_size(child)
                if size > 0:
                    items.append({
                        "path": str(child),
                        "name": child.name,
                        "category": category,
                        "size": size,
                        "size_human": humanize.naturalsize(size, binary=True),
                        "type": "directory",
                    })
        else:
            size = _dir_size(path)
            if size > 0:
                items.append({
                    "path": str(path),
                    "name": category,
                    "category": category,
                    "size": size,
                    "size_human": humanize.naturalsize(size, binary=True),
                    "type": "directory",
                })

    items.sort(key=lambda x: x["size"], reverse=True)
    total = sum(i["size"] for i in items)
    return {"items": items, "count": len(items),
            "total": total, "total_human": humanize.naturalsize(total, binary=True)}
