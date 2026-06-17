import os
import urllib.request
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
import time

ICONS_DIR = os.path.join(os.path.dirname(__file__), '../public/assets/icons')
MAPPING_URL = 'https://prices.runescape.wiki/api/v1/osrs/mapping'
USER_AGENT = 'OSRSMarketTracker/1.0 (contact: samirkatakamsetty@gmail.com; developer project)'

os.makedirs(ICONS_DIR, exist_ok=True)

def download_icon(item):
    item_id = item.get('id')
    if not item_id:
        return 'skipped'

    dest_path = os.path.join(ICONS_DIR, f"{item_id}.png")
    if os.path.exists(dest_path):
        return 'skipped'

    # Download directly from OSRSBox CDN
    cdn_url = f"https://www.osrsbox.com/osrsbox-db/items-icons/{item_id}.png"

    attempts = 3
    for attempt in range(1, attempts + 1):
        try:
            req = urllib.request.Request(
                cdn_url,
                headers={'User-Agent': USER_AGENT}
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                with open(dest_path, 'wb') as f:
                    f.write(response.read())
            return 'downloaded'
        except Exception as e:
            if attempt == attempts:
                print(f"Failed to download icon for item {item.get('name')} ({item_id}) after {attempts} attempts: {e}")
                return 'failed'
            time.sleep(1.5 ** attempt)
    return 'failed'

def main():
    print("Fetching item mapping from OSRS Wiki...")
    req = urllib.request.Request(
        MAPPING_URL,
        headers={'User-Agent': USER_AGENT}
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            items = json.loads(response.read().decode('utf-8'))
    except Exception as e:
        print(f"Fatal: Failed to fetch mapping: {e}")
        return

    print(f"Found {len(items)} items in mapping. Starting parallel download pool (45 threads) from OSRSBox CDN...")

    downloaded = 0
    skipped = 0
    failed = 0
    total = len(items)

    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=45) as executor:
        # Submit tasks
        future_to_item = {executor.submit(download_icon, item): item for item in items}
        
        processed = 0
        for future in as_completed(future_to_item):
            processed += 1
            res = future.result()
            if res == 'downloaded':
                downloaded += 1
            elif res == 'skipped':
                skipped += 1
            elif res == 'failed':
                failed += 1

            if processed % 100 == 0 or processed == total:
                print(f"Progress: {processed}/{total} processed (Downloaded: {downloaded}, Skipped: {skipped}, Failed: {failed})")

    duration = time.time() - start_time
    print(f"Download finished in {duration:.1f}s.")
    print(f"Stats: Total Downloaded = {downloaded}, Skipped = {skipped}, Failed = {failed}")

if __name__ == '__main__':
    main()
