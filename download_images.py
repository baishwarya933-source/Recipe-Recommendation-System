import os
import time
import re
import sys
from pathlib import Path
import pandas as pd
import requests


CSV_PATH = Path("food_items_with_image_urls_20000.csv")
OUT_DIR = Path("food_images")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Optional: limit number of downloads (set env DOWNLOAD_LIMIT), 0 or missing = no limit
try:
    DOWNLOAD_LIMIT = int(os.getenv("DOWNLOAD_LIMIT", "0"))
except ValueError:
    DOWNLOAD_LIMIT = 0

# Simple filename sanitizer
def sanitize_filename(name: str) -> str:
    name = str(name or '')
    name = name.strip()
    # Remove problematic characters
    name = re.sub(r"[^A-Za-z0-9 _.-]", "", name)
    name = name.replace(" ", "_")
    if not name:
        name = "image"
    return name[:120]


if not CSV_PATH.exists():
    print(f"CSV file not found: {CSV_PATH.resolve()}")
    sys.exit(1)

df = pd.read_csv(CSV_PATH)

session = requests.Session()
session.headers.update({
    "User-Agent": os.getenv("DOWNLOAD_USER_AGENT", "Mozilla/5.0 (compatible; ImageFetcher/1.0)"),
})

def download_image(url: str, dest: Path, max_retries: int = 3, timeout: int = 15) -> bool:
    if dest.exists() and dest.stat().st_size > 100:
        # Already downloaded
        return True
    for attempt in range(1, max_retries + 1):
        try:
            with session.get(url, timeout=timeout, stream=True, allow_redirects=True) as r:
                if r.status_code != 200:
                    raise Exception(f"HTTP {r.status_code}")
                ct = r.headers.get("content-type", "")
                if not ct.startswith("image/") and attempt == 1:
                    # Some hosts may respond with redirects; still try to save if bytes present
                    pass
                # Stream to file
                tmp = dest.with_suffix(dest.suffix + ".part")
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                tmp.replace(dest)
                return True
        except Exception as e:
            wait = 1.5 ** attempt
            print(f"Attempt {attempt} failed for {url}: {e}. Retrying in {wait:.1f}s...")
            time.sleep(wait)
    return False


total = len(df)
downloaded = 0
errors = 0
try:
    for idx, row in df.iterrows():
        if DOWNLOAD_LIMIT and downloaded >= DOWNLOAD_LIMIT:
            break
        food_raw = row.get("food_name") or row.get("food") or f"item_{idx}"
        original_url = row.get("image_url") or row.get("image") or ''
        url = str(original_url or '').strip()

        # If URL is a source.unsplash.com query URL, replace with a seeded picsum.photos URL to avoid 503s and redirects
        if 'source.unsplash.com' in url.lower() or 'source-unsplash' in url.lower():
            seed = sanitize_filename(food_raw).lower()
            url = f"https://picsum.photos/seed/{seed}/800/600"

        name = sanitize_filename(food_raw)
        ext = os.path.splitext(url)[1].split("?")[0] if url else ".jpg"
        if not ext or len(ext) > 6:
            ext = ".jpg"
        file_path = OUT_DIR / f"{name}{ext}"

        if not url:
            print(f"[{idx+1}/{total}] Skipping {name}: no URL")
            errors += 1
            continue

        print(f"[{idx+1}/{total}] Downloading {name} from {url} -> {file_path.name}...")
        ok = download_image(url, file_path)
        if ok:
            downloaded += 1
        else:
            print(f"Failed to download {name} from {url}")
            errors += 1

        # Gentle pacing
        time.sleep(0.25)
except KeyboardInterrupt:
    print("Download interrupted by user")

print(f"Done. downloaded={downloaded}, errors={errors}")
