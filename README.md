# Mac Cleaner

A lightweight, local-first Mac disk cleaning tool built with Python and a browser UI. No telemetry, no subscriptions — runs entirely on your machine.

![Python](https://img.shields.io/badge/Python-3.9%2B-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-latest-green) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

## Features

| Tab | What it does |
|-----|-------------|
| **Cache & Logs** | Scans `~/Library/Caches` and `~/Library/Logs` by app, shows size per entry |
| **Large Files** | Walks your home directory for files above a size threshold, with optional last-accessed filter |
| **Duplicates** | Finds identical files using MD5 content hashing — pre-selects extras and marks which copy to keep |
| **Disk Map** | Interactive treemap (ECharts) showing folder sizes at configurable depth |

All deletions move files to the macOS **Trash** (via `send2trash`) — nothing is permanently deleted until you empty the Trash.

## Screenshot

```
┌─────────────────┬──────────────────────────────────────────────┐
│  🧹 Mac Cleaner │  Cache & Logs                        [Scan]  │
│                 │  ┌─────────────────────────────────────────┐ │
│  🗑️ Cache & Logs│  │ Items: 76    Total size: 69.4 MiB       │ │
│  📦 Large Files │  └─────────────────────────────────────────┘ │
│  ♊  Duplicates  │  ☐  com.apple.Safari      48.2 MiB          │
│  💿 Disk Map    │  ☐  com.google.Chrome     12.1 MiB          │
│                 │  ☐  ...                                      │
│                 │  [Move Selected to Trash]  3 items selected  │
└─────────────────┴──────────────────────────────────────────────┘
```

## Requirements

- macOS (tested on macOS 14+)
- Python 3.9+

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/mac-cleaner.git
cd mac-cleaner
pip3 install -r requirements.txt
```

## Running

```bash
python3 -m uvicorn main:app --host 127.0.0.1 --port 8765
```

Then open **http://127.0.0.1:8765** in your browser.

## Project Structure

```
mac-cleaner/
├── main.py                    # FastAPI app and API routes
├── requirements.txt
├── scanners/
│   ├── cache_scanner.py       # Scans ~/Library/Caches and ~/Library/Logs
│   ├── large_file_finder.py   # Finds large/old files in home directory
│   ├── duplicate_finder.py    # MD5-based duplicate detection
│   └── disk_visualizer.py     # Folder size tree for treemap rendering
└── static/
    ├── index.html             # Single-page app shell
    ├── style.css              # macOS-inspired dark theme
    └── app.js                 # Tab navigation, scan/delete logic, ECharts treemap
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scan/cache` | Cache and log directories with sizes |
| `GET` | `/api/scan/large-files?min_mb=100&days_old=0` | Large files in home directory |
| `GET` | `/api/scan/duplicates?path=~/Downloads` | Duplicate file groups |
| `GET` | `/api/disk/usage?path=~&depth=2` | Folder size tree |
| `POST` | `/api/delete` | Move files to Trash `{ "paths": [...] }` |

## Safety

- Deletions use `send2trash` — files go to Trash, not `rm`
- Symlinks are skipped during directory scans
- System paths (`/System`, `/usr`, `/bin`, developer build caches) are excluded from large-file scans
- Results are capped (500 large files, 200 duplicate groups) to keep the UI responsive

## License

MIT
