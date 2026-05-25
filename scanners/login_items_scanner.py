import os
import plistlib
import subprocess
from pathlib import Path

AGENT_DIRS = [
    ("~/Library/LaunchAgents", "user"),
    ("/Library/LaunchAgents",  "system"),
    ("/Library/LaunchDaemons", "system"),
]


def _running_labels():
    try:
        out = subprocess.run(
            ["launchctl", "list"],
            capture_output=True, text=True, timeout=5
        ).stdout
        labels = set()
        for line in out.splitlines()[1:]:
            parts = line.split("\t")
            if len(parts) >= 3:
                labels.add(parts[2].strip())
        return labels
    except Exception:
        return set()


def _read_plist(path):
    try:
        with open(str(path), "rb") as f:
            return plistlib.load(f)
    except Exception:
        return {}


def scan_login_items():
    running = _running_labels()
    items = []

    for raw_dir, scope in AGENT_DIRS:
        dirpath = Path(raw_dir).expanduser()
        if not dirpath.exists():
            continue
        try:
            for entry in dirpath.iterdir():
                if not entry.name.endswith(".plist"):
                    continue
                data = _read_plist(entry)
                label = data.get("Label", entry.stem)
                program_args = data.get("ProgramArguments") or []
                program = data.get("Program") or (program_args[0] if program_args else "")
                program_name = os.path.basename(program) if program else label.split(".")[-1]
                items.append({
                    "path": str(entry),
                    "label": label,
                    "name": program_name,
                    "program": program,
                    "run_at_load": bool(data.get("RunAtLoad", False)),
                    "running": label in running,
                    "scope": scope,
                    "type": "plist",
                    "size": 0,
                    "size_human": "—",
                })
        except (PermissionError, OSError):
            pass

    items.sort(key=lambda x: (x["scope"] != "user", not x["run_at_load"], x["label"]))
    return {"items": items, "count": len(items)}


def toggle_login_item(path, enable):
    data = _read_plist(path)
    label = data.get("Label", "")
    uid = os.getuid()
    scope = f"gui/{uid}" if path.startswith(str(Path("~/Library").expanduser())) else "system"
    try:
        if enable:
            subprocess.run(["launchctl", "load", "-w", path],
                           capture_output=True, timeout=8)
        else:
            subprocess.run(["launchctl", "unload", "-w", path],
                           capture_output=True, timeout=8)
        return {"ok": True, "label": label}
    except Exception as e:
        return {"ok": False, "label": label, "error": str(e)}
