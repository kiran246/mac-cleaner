import io
import os
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from scanners.app_manager import find_app_leftovers, scan_apps
from scanners.browser_scanner import scan_browsers
from scanners.cache_scanner import scan_caches
from scanners.disk_visualizer import get_disk_usage, list_directory_contents
from scanners.duplicate_finder import find_duplicates
from scanners.ios_scanner import scan_ios_backups
from scanners.large_file_finder import find_large_files
from scanners.login_items_scanner import scan_login_items, toggle_login_item
from scanners.mail_scanner import scan_mail
from scanners.privacy_scanner import get_network_connections, scan_privacy
from scanners.process_monitor import get_memory_stats, get_processes, kill_process, run_maintenance
from scanners.screenshot_scanner import scan_screenshots
from scanners.similar_photos import scan_similar_photos
from scanners.symlink_scanner import scan_broken_symlinks, scan_empty_folders
from scanners.trash_scanner import scan_trash
from scanners.xcode_scanner import scan_xcode

app = FastAPI(title="Mac Cleaner")
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Root ───────────────────────────────────────────────────────────────────

@app.get("/")
def index():
    return FileResponse("static/index.html")


# ── Delete / Reveal ────────────────────────────────────────────────────────

class DeleteRequest(BaseModel):
    paths: list[str]


@app.post("/api/delete")
def delete_files(req: DeleteRequest):
    import send2trash
    deleted, errors = [], []
    for path in req.paths:
        try:
            send2trash.send2trash(os.path.abspath(os.path.expanduser(path)))
            deleted.append(path)
        except Exception as e:
            errors.append({"path": path, "error": str(e)})
    return {"deleted": deleted, "errors": errors}


@app.get("/api/reveal")
def reveal_in_finder(path: str):
    import subprocess
    abs_path = os.path.abspath(os.path.expanduser(path))
    cmd = ["open", abs_path] if os.path.isdir(abs_path) else ["open", "-R", abs_path]
    subprocess.run(cmd, check=False)
    return {"ok": True}


# ── Thumbnail ──────────────────────────────────────────────────────────────

@app.get("/api/thumbnail")
def get_thumbnail(path: str, size: int = 200):
    try:
        from PIL import Image, UnidentifiedImageError
        abs_path = Path(path).expanduser().resolve()
        if not str(abs_path).startswith(str(Path.home())):
            return Response(status_code=403)
        img = Image.open(abs_path).convert("RGB")
        img.thumbnail((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=75)
        return Response(content=buf.getvalue(), media_type="image/jpeg")
    except Exception:
        return Response(status_code=404)


# ── Clean Space ────────────────────────────────────────────────────────────

@app.get("/api/scan/cache")
def api_cache():
    return scan_caches()


@app.get("/api/scan/screenshots")
def api_screenshots():
    return scan_screenshots()


@app.get("/api/scan/mail")
def api_mail():
    return scan_mail()


@app.get("/api/scan/ios")
def api_ios():
    return scan_ios_backups()


@app.get("/api/scan/xcode")
def api_xcode():
    return scan_xcode()


@app.get("/api/scan/browser")
def api_browser():
    return scan_browsers()


@app.get("/api/scan/trash")
def api_trash():
    return scan_trash()


@app.get("/api/scan/large-files")
def api_large(min_mb: int = 100, days_old: int = 0):
    return find_large_files(min_mb=min_mb, days_old=days_old)


# ── Performance ────────────────────────────────────────────────────────────

@app.get("/api/scan/login-items")
def api_login_items():
    return scan_login_items()


class ToggleRequest(BaseModel):
    path: str
    enable: bool


@app.post("/api/login-items/toggle")
def api_toggle_login_item(req: ToggleRequest):
    return toggle_login_item(req.path, req.enable)


@app.get("/api/processes")
def api_processes(sort_by: str = "cpu", limit: int = 50):
    return get_processes(sort_by=sort_by, limit=limit)


@app.get("/api/memory")
def api_memory():
    return get_memory_stats()


class KillRequest(BaseModel):
    pid: int
    force: bool = False


@app.post("/api/processes/kill")
def api_kill(req: KillRequest):
    return kill_process(req.pid, req.force)


class MaintenanceRequest(BaseModel):
    script: str


@app.post("/api/maintenance/run")
def api_maintenance(req: MaintenanceRequest):
    return run_maintenance(req.script)


# ── Privacy ────────────────────────────────────────────────────────────────

@app.get("/api/scan/privacy")
def api_privacy():
    return scan_privacy()


@app.get("/api/network")
def api_network():
    return get_network_connections()


# ── Declutter ──────────────────────────────────────────────────────────────

@app.get("/api/scan/duplicates")
def api_duplicates(path: str = "~/Downloads"):
    return find_duplicates(path)


@app.get("/api/scan/similar-photos")
def api_similar_photos(path: str = "~/Pictures",
                       threshold: int = Query(default=10, ge=1, le=20)):
    return scan_similar_photos(scan_path=path, threshold=threshold)


@app.get("/api/scan/apps")
def api_apps():
    return scan_apps()


class LeftoversRequest(BaseModel):
    bundle_id: str
    app_name: str


@app.post("/api/apps/leftovers")
def api_leftovers(req: LeftoversRequest):
    return find_app_leftovers(req.bundle_id, req.app_name)


@app.get("/api/scan/symlinks")
def api_symlinks(path: str = "~"):
    return scan_broken_symlinks(path)


@app.get("/api/scan/empty-folders")
def api_empty(path: str = "~"):
    return scan_empty_folders(path)


# ── Disk Map ───────────────────────────────────────────────────────────────

@app.get("/api/disk/usage")
def api_disk_usage(path: str = "~", depth: int = Query(default=2, ge=1, le=4)):
    return get_disk_usage(path, depth=depth)


@app.get("/api/disk/files")
def api_disk_files(path: str):
    return list_directory_contents(path)


if __name__ == "__main__":
    import signal
    import subprocess
    import uvicorn

    PORT = 8765

    # Kill any process already bound to the port
    try:
        result = subprocess.run(
            ["lsof", "-ti", f":{PORT}"],
            capture_output=True, text=True
        )
        pids = result.stdout.strip().split()
        for pid in pids:
            os.kill(int(pid), signal.SIGTERM)
            print(f"Killed existing process {pid} on port {PORT}")
    except Exception:
        pass

    uvicorn.run(app, host="127.0.0.1", port=PORT)
