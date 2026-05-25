import os

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from scanners.cache_scanner import scan_caches
from scanners.disk_visualizer import get_disk_usage
from scanners.duplicate_finder import find_duplicates
from scanners.large_file_finder import find_large_files

app = FastAPI(title="Mac Cleaner")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    return FileResponse("static/index.html")


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


@app.get("/api/scan/cache")
def api_scan_cache():
    return scan_caches()


@app.get("/api/scan/large-files")
def api_large_files(min_mb: int = 100, days_old: int = 0):
    return find_large_files(min_mb=min_mb, days_old=days_old)


@app.get("/api/scan/duplicates")
def api_duplicates(path: str = "~/Downloads"):
    return find_duplicates(path)


@app.get("/api/disk/usage")
def api_disk_usage(path: str = "~", depth: int = Query(default=2, ge=1, le=4)):
    return get_disk_usage(path, depth=depth)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8765)
