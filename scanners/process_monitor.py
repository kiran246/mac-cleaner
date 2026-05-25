import os
import re
import signal
import subprocess


def get_processes(sort_by="cpu", limit=50):
    try:
        out = subprocess.run(
            ["ps", "-eo", "pid,pcpu,pmem,rss,comm"],
            capture_output=True, text=True, timeout=10
        ).stdout
    except Exception as e:
        return {"processes": [], "count": 0, "error": str(e)}

    processes = []
    for line in out.splitlines()[1:]:
        parts = line.split(None, 4)
        if len(parts) < 5:
            continue
        try:
            pid = int(parts[0])
            cpu = float(parts[1])
            mem_pct = float(parts[2])
            rss_bytes = int(parts[3]) * 1024
            cmd = parts[4].strip()
            name = os.path.basename(cmd)[:40]
            processes.append({
                "pid": pid,
                "name": name,
                "cmd": cmd[:80],
                "cpu": cpu,
                "mem_pct": mem_pct,
                "rss": rss_bytes,
                "rss_human": _fmt_bytes(rss_bytes),
            })
        except (ValueError, IndexError):
            pass

    key = "cpu" if sort_by == "cpu" else "rss"
    processes.sort(key=lambda x: x[key], reverse=True)
    return {"processes": processes[:limit], "count": len(processes)}


def kill_process(pid, force=False):
    if pid < 100:
        return {"ok": False, "error": "Cannot kill system processes (PID < 100)"}
    if pid == os.getpid():
        return {"ok": False, "error": "Cannot kill the server process"}
    try:
        sig = signal.SIGKILL if force else signal.SIGTERM
        os.kill(pid, sig)
        return {"ok": True}
    except ProcessLookupError:
        return {"ok": False, "error": "Process not found"}
    except PermissionError:
        return {"ok": False, "error": "Permission denied"}


def get_memory_stats():
    try:
        vm_out = subprocess.run(
            ["vm_stat"], capture_output=True, text=True, timeout=5
        ).stdout
        mem_out = subprocess.run(
            ["sysctl", "-n", "hw.memsize"],
            capture_output=True, text=True, timeout=5
        ).stdout

        page_match = re.search(r"page size of (\d+) bytes", vm_out)
        page_size = int(page_match.group(1)) if page_match else 16384

        stats = {}
        for line in vm_out.splitlines():
            m = re.match(r"^(.+?):\s+(\d+)", line)
            if m:
                stats[m.group(1).strip()] = int(m.group(2)) * page_size

        total_bytes = int(mem_out.strip())
        free   = stats.get("Pages free", 0)
        active = stats.get("Pages active", 0)
        inactive = stats.get("Pages inactive", 0)
        wired  = stats.get("Pages wired down", 0)
        compressed = stats.get("Pages occupied by compressor", 0)
        used = active + wired + compressed

        return {
            "total":          total_bytes,
            "used":           used,
            "free":           free + inactive,
            "active":         active,
            "inactive":       inactive,
            "wired":          wired,
            "compressed":     compressed,
            "total_human":    _fmt_bytes(total_bytes),
            "used_human":     _fmt_bytes(used),
            "free_human":     _fmt_bytes(free + inactive),
            "used_pct":       round(used / total_bytes * 100, 1) if total_bytes else 0,
        }
    except Exception as e:
        return {"error": str(e)}


def run_maintenance(script):
    SCRIPTS = {
        "daily":   'do shell script "periodic daily" with administrator privileges',
        "weekly":  'do shell script "periodic weekly" with administrator privileges',
        "monthly": 'do shell script "periodic monthly" with administrator privileges',
        "purge":   'do shell script "purge" with administrator privileges',
    }
    if script == "dns":
        try:
            subprocess.run(["dscacheutil", "-flushcache"], timeout=10)
            subprocess.run(["killall", "-HUP", "mDNSResponder"],
                           timeout=10, capture_output=True)
            return {"ok": True, "output": "DNS cache flushed"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    apple_script = SCRIPTS.get(script)
    if not apple_script:
        return {"ok": False, "error": f"Unknown script: {script}"}
    try:
        r = subprocess.run(
            ["osascript", "-e", apple_script],
            capture_output=True, text=True, timeout=120
        )
        if r.returncode == 0:
            return {"ok": True, "output": r.stdout.strip() or "Done"}
        # User cancelled or wrong password
        err = r.stderr.strip()
        if "User canceled" in err or "-128" in err:
            return {"ok": False, "error": "Cancelled"}
        return {"ok": False, "error": err or "Failed"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Timed out"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _fmt_bytes(b):
    for unit in ("B", "KB", "MB", "GB"):
        if b < 1024:
            return f"{b:.1f} {unit}"
        b /= 1024
    return f"{b:.2f} TB"
