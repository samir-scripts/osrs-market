import urllib.request
import json
import time
import base64
from datetime import datetime

def run():
    now = int(time.time())
    # round down to nearest hour
    now = now - (now % 3600)
    
    # We want 30 days of 1-hour data (30 * 24 = 720 hours)
    start_time = now - (30 * 24 * 3600)
    
    clickhouse_url = "http://localhost:8123"
    auth_b64 = base64.b64encode(b"default:default").decode("utf-8")
    
    print(f"Starting backfill from {start_time} to {now} (30 days)")
    
    for ts in range(start_time, now + 1, 3600):
        url = f"https://prices.runescape.wiki/api/v1/osrs/1h?timestamp={ts}"
        req = urllib.request.Request(url, headers={'User-Agent': 'osrs-market-backfill-script-v1'})
        
        retries = 3
        while retries > 0:
            try:
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode('utf-8'))
                    if not data or 'data' not in data:
                        break
                    
                    rows = []
                    for item_id, item_data in data['data'].items():
                        avg_high_price = item_data.get('avgHighPrice') or 0
                        high_vol = item_data.get('highPriceVolume') or 0
                        avg_low_price = item_data.get('avgLowPrice') or 0
                        low_vol = item_data.get('lowPriceVolume') or 0
                        
                        rows.append(f"({item_id}, {ts}, toDateTime({ts}), {avg_high_price}, {high_vol}, {avg_low_price}, {low_vol})")
                    
                    if rows:
                        ch_req = urllib.request.Request(
                            clickhouse_url,
                            data=f"INSERT INTO osrs.clean_osrs_prices VALUES {','.join(rows)}".encode('utf-8'),
                            method="POST"
                        )
                        ch_req.add_header("Authorization", f"Basic {auth_b64}")
                        urllib.request.urlopen(ch_req)
                        
                    print(f"Processed timestamp {ts} with {len(rows)} items.")
                    break
            except Exception as e:
                print(f"Error fetching ts {ts}: {e}")
                retries -= 1
                time.sleep(2.0)
        
        # Polite delay to respect Wiki API (target ~1-2 req/sec)
        time.sleep(0.75)
        
    print("Backfill complete.")

if __name__ == "__main__":
    run()
