# Mac Cleaner

A lightweight, local-first Mac disk cleaning tool built with Python and a browser UI — covering the same ground as CleanMyMac. No telemetry, no subscriptions, runs entirely on your machine.

![Python](https://img.shields.io/badge/Python-3.9%2B-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-latest-green) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

## Quick Install

Open **Terminal** (press `⌘ Space`, type `Terminal`, hit Enter) and paste:

```bash
curl -fsSL https://raw.githubusercontent.com/kiran246/mac-cleaner/main/install.sh | bash
```

The script installs everything automatically (Homebrew, Python, dependencies) and creates a **Mac Cleaner** launcher on your Desktop. When it finishes, **double-click that file** to start the app — your browser will open automatically.

> **First-run note:** macOS may show a security prompt the very first time you double-click the launcher. Click **Open** to proceed.

### Updating later

To get the latest version, just run the same `curl` command again. It updates in place.

---

## Features

Organized into five sections, accessible from the sidebar:

### Clean Space
| Tab | What it does |
|-----|-------------|
| **Cache & Logs** | Scans `~/Library/Caches` and `~/Library/Logs` broken down by app |
| **Screenshots** | Finds screenshots on the Desktop and in `~/Pictures/Screenshots` |
| **Mail Attachments** | Locates attachment folders inside `~/Library/Mail` |
| **iOS Backups** | Lists iPhone/iPad backups in MobileSync with device name and date |
| **Xcode Artifacts** | Finds DerivedData, Archives, Simulators, device support files, and caches |
| **Browser Caches** | Scans Chrome, Safari, Firefox, Arc, Brave, Edge, and Opera cache dirs |
| **Trash & Archives** | Shows Trash contents (main + external volumes) and old DMG/ZIP/PKG files |
| **Large Files** | Walks home directory for files above a size threshold, with optional age filter |

### Performance
| Tab | What it does |
|-----|-------------|
| **Login Items** | Lists LaunchAgents from user and system dirs; toggle items on/off |
| **Processes** | Live process table sortable by CPU or RAM with per-process kill button |
| **Maintenance** | One-click scripts: flush DNS cache, run daily/weekly/monthly periodic tasks, purge inactive RAM |

### Privacy
| Tab | What it does |
|-----|-------------|
| **Privacy Items** | Browser history, cookies, Recent Documents list, QuickLook thumbnail cache |
| **Network** | Active connections grouped by process (via `lsof`), showing ESTABLISHED and LISTEN sockets |

### Declutter
| Tab | What it does |
|-----|-------------|
| **Duplicates** | Groups identical files by MD5 hash; pre-selects extras, marks one copy to keep |
| **Similar Photos** | Finds visually similar images using perceptual hashing; shows thumbnail groups |
| **App Manager** | Lists installed apps with size and last-used date; scans for leftover support files after removal |
| **Symlinks & Folders** | Finds broken symbolic links and empty folders |

### Visualize
| Tab | What it does |
|-----|-------------|
| **Disk Map** | Interactive treemap (ECharts) — click any folder to drill into its contents in a side panel |

All deletions move files to the macOS **Trash** (via `send2trash`) — nothing is permanently deleted until you empty the Trash.

## Manual Setup (developers)

If you prefer to set up manually:

```bash
git clone https://github.com/kiran246/mac-cleaner.git
cd mac-cleaner
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8765
```

Then open **http://127.0.0.1:8765** in your browser.

**Optional:** install `imagehash` for higher-quality perceptual photo comparison:
```bash
.venv/bin/pip install imagehash
```

**Requirements:** macOS 14+, Python 3.9+

## Project Structure

```
mac-cleaner/
├── main.py                       # FastAPI app — all API routes
├── requirements.txt
├── scanners/
│   ├── cache_scanner.py          # ~/Library/Caches and ~/Library/Logs
│   ├── screenshot_scanner.py     # Desktop and ~/Pictures/Screenshots
│   ├── mail_scanner.py           # Mail attachment directories
│   ├── ios_scanner.py            # MobileSync iPhone/iPad backups
│   ├── xcode_scanner.py          # DerivedData, Archives, Simulators, etc.
│   ├── browser_scanner.py        # Chrome, Safari, Firefox, Arc, Brave, Edge, Opera
│   ├── trash_scanner.py          # Trash contents + old archives in Downloads
│   ├── large_file_finder.py      # Large/old files in home directory
│   ├── login_items_scanner.py    # LaunchAgents with enable/disable toggle
│   ├── process_monitor.py        # Process list, memory stats, kill, maintenance
│   ├── privacy_scanner.py        # Browser history/cookies, QuickLook cache, network
│   ├── duplicate_finder.py       # MD5-based duplicate detection
│   ├── similar_photos.py         # Perceptual hash photo grouping (PIL + optional imagehash)
│   ├── app_manager.py            # Installed apps + leftover support file scanner
│   ├── symlink_scanner.py        # Broken symlinks and empty folders
│   └── disk_visualizer.py        # Folder size tree for treemap and drill-down panel
└── static/
    ├── index.html                # Single-page app shell with sidebar navigation
    ├── style.css                 # macOS-inspired dark theme
    └── app.js                    # Scan/delete logic for all 17 tabs, ECharts treemap
```

## API Reference

### Clean Space
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scan/cache` | Cache and log directories |
| `GET` | `/api/scan/screenshots` | Screenshot files |
| `GET` | `/api/scan/mail` | Mail attachment folders |
| `GET` | `/api/scan/ios` | iOS/iPadOS backups |
| `GET` | `/api/scan/xcode` | Xcode artifacts |
| `GET` | `/api/scan/browser` | Browser cache directories |
| `GET` | `/api/scan/trash` | Trash items and old archives |
| `GET` | `/api/scan/large-files?min_mb=100&days_old=0` | Large files in home directory |

### Performance
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scan/login-items` | LaunchAgent items |
| `POST` | `/api/login-items/toggle` | Enable/disable a login item `{ "path": "...", "enable": true }` |
| `GET` | `/api/processes?sort_by=cpu&limit=50` | Process list |
| `GET` | `/api/memory` | Memory usage stats |
| `POST` | `/api/processes/kill` | Kill a process `{ "pid": 1234, "force": false }` |
| `POST` | `/api/maintenance/run` | Run a maintenance script `{ "script": "dns\|daily\|weekly\|monthly\|purge" }` |

### Privacy
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scan/privacy` | Privacy item list (history, cookies, caches) |
| `GET` | `/api/network` | Active network connections by process |

### Declutter
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scan/duplicates?path=~/Downloads` | Duplicate file groups |
| `GET` | `/api/scan/similar-photos?path=~/Pictures&threshold=10` | Visually similar photo groups |
| `GET` | `/api/scan/apps` | Installed applications with size and metadata |
| `POST` | `/api/apps/leftovers` | Find leftover files for a removed app `{ "bundle_id": "...", "app_name": "..." }` |
| `GET` | `/api/scan/symlinks?path=~` | Broken symbolic links |
| `GET` | `/api/scan/empty-folders?path=~` | Empty directories |

### Disk / Shared
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/disk/usage?path=~&depth=2` | Folder size tree for treemap |
| `GET` | `/api/disk/files?path=...` | Directory contents for drill-down panel |
| `POST` | `/api/delete` | Move files to Trash `{ "paths": [...] }` |
| `GET` | `/api/reveal?path=...` | Reveal a file or folder in Finder |
| `GET` | `/api/thumbnail?path=...&size=200` | JPEG thumbnail for image files |

## Safety

- All deletions use `send2trash` — files go to the Trash, not `rm`
- Symlinks are skipped during directory traversal
- System directories (`/System`, `/usr`, `/bin`, etc.) are excluded from scans
- The thumbnail endpoint restricts access to paths inside the user's home directory
- Process kill is blocked for PID < 100 and the server's own PID
- Scan results are capped (500 files, 200 duplicate groups, 2000 photos, 100 similar-photo groups) to keep the UI responsive

## License

MIT
