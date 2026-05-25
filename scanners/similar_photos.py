import os
from pathlib import Path

import humanize

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp"}
MIN_SIZE = 10 * 1024   # skip tiny icons
MAX_FILES = 2000


# ── Hashing ────────────────────────────────────────────────────────────────

def _ahash(img, size=8):
    img = img.convert("L").resize((size, size))
    pixels = list(img.getdata())
    avg = sum(pixels) / len(pixels)
    bits = [1 if p > avg else 0 for p in pixels]
    return sum(b << i for i, b in enumerate(bits))


def _hamming(a, b):
    return bin(a ^ b).count("1")


def _compute_hash(path, use_phash):
    from PIL import Image, UnidentifiedImageError
    try:
        img = Image.open(path)
        img.load()
        if use_phash:
            import imagehash
            return str(imagehash.phash(img))
        return _ahash(img)
    except Exception:
        return None


# ── Union-Find ─────────────────────────────────────────────────────────────

def _find(parent, i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


def _union(parent, i, j):
    ri, rj = _find(parent, i), _find(parent, j)
    if ri != rj:
        parent[ri] = rj


# ── Main ───────────────────────────────────────────────────────────────────

def scan_similar_photos(scan_path="~/Pictures", threshold=10):
    try:
        from PIL import Image
    except ImportError:
        return {
            "error": "Pillow not installed. Run: pip3 install Pillow",
            "groups": [], "total_groups": 0,
            "total_wasted": 0, "total_wasted_human": "0 B",
        }

    use_phash = False
    try:
        import imagehash  # noqa
        use_phash = True
        threshold = threshold        # phash: 10 is a good default
    except ImportError:
        threshold = min(threshold, 5)   # ahash needs tighter threshold

    base = Path(scan_path).expanduser()
    image_paths = []

    for dp, dirnames, fnames in os.walk(str(base), followlinks=False):
        dirnames[:] = [d for d in dirnames if not d.startswith(".")]
        for f in fnames:
            if Path(f).suffix.lower() in IMAGE_EXTS:
                full = os.path.join(dp, f)
                try:
                    if os.path.getsize(full) >= MIN_SIZE:
                        image_paths.append(full)
                except OSError:
                    pass
        if len(image_paths) >= MAX_FILES:
            break

    if not image_paths:
        return {"groups": [], "total_groups": 0,
                "total_wasted": 0, "total_wasted_human": "0 B",
                "scan_path": str(base), "hash_method": "phash" if use_phash else "ahash"}

    # Compute hashes
    hashes = {}
    for p in image_paths:
        h = _compute_hash(p, use_phash)
        if h is not None:
            hashes[p] = h

    paths = list(hashes.keys())
    n = len(paths)
    parent = list(range(n))

    if use_phash:
        import imagehash as ih
        hash_objs = [ih.hex_to_hash(hashes[p]) for p in paths]
        for i in range(n):
            for j in range(i + 1, n):
                if hash_objs[i] - hash_objs[j] <= threshold:
                    _union(parent, i, j)
    else:
        int_hashes = [hashes[p] for p in paths]
        for i in range(n):
            for j in range(i + 1, n):
                if _hamming(int_hashes[i], int_hashes[j]) <= threshold:
                    _union(parent, i, j)

    # Build groups
    from collections import defaultdict
    groups_map = defaultdict(list)
    for i, p in enumerate(paths):
        groups_map[_find(parent, i)].append(p)

    result_groups = []
    total_wasted = 0
    for members in groups_map.values():
        if len(members) < 2:
            continue
        photos = []
        for p in members:
            try:
                size = os.path.getsize(p)
                photos.append({"path": p, "name": os.path.basename(p),
                               "size": size,
                               "size_human": humanize.naturalsize(size, binary=True)})
            except OSError:
                pass
        if len(photos) < 2:
            continue
        photos.sort(key=lambda x: x["size"], reverse=True)
        wasted = sum(f["size"] for f in photos[1:])
        total_wasted += wasted
        result_groups.append({
            "count": len(photos),
            "wasted": wasted,
            "wasted_human": humanize.naturalsize(wasted, binary=True),
            "photos": photos,
        })

    result_groups.sort(key=lambda x: x["wasted"], reverse=True)
    return {
        "groups": result_groups[:100],
        "total_groups": len(result_groups),
        "total_wasted": total_wasted,
        "total_wasted_human": humanize.naturalsize(total_wasted, binary=True),
        "scan_path": str(base),
        "hash_method": "phash" if use_phash else "ahash",
        "files_scanned": len(paths),
    }
