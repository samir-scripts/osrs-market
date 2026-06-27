import os
import logging
import requests
import time
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import clickhouse_connect
from cachetools import TTLCache, cached
from fastapi.middleware.cors import CORSMiddleware

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="OSRS Market API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLICKHOUSE_HOST = os.getenv("CLICKHOUSE_HOST", "clickhouse")
CLICKHOUSE_PORT = int(os.getenv("CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_USER = os.getenv("CLICKHOUSE_USER", "default")
CLICKHOUSE_PASSWORD = os.getenv("CLICKHOUSE_PASSWORD", "password")

# In-memory mapping cache
item_metadata_cache = {}
last_metadata_fetch = 0

def fetch_item_metadata():
    global item_metadata_cache, last_metadata_fetch
    # Fetch every 24 hours
    if time.time() - last_metadata_fetch < 86400 and item_metadata_cache:
        return item_metadata_cache
        
    try:
        logger.info("Fetching item metadata mapping from OSRS Wiki API...")
        headers = {"User-Agent": "OSRS Market Tracker - @DevelopmentSandbox"}
        res = requests.get("https://prices.runescape.wiki/api/v1/osrs/mapping", headers=headers, timeout=10)
        res.raise_for_status()
        mapping = res.json()
        
        new_cache = {}
        for item in mapping:
            item_id = item.get("id")
            if item_id is not None:
                new_cache[int(item_id)] = {
                    "item_id": int(item_id),
                    "name": item.get("name"),
                    "value": item.get("value", 0),
                    "members": item.get("members", False),
                    "limit": item.get("limit", 0)
                }
        item_metadata_cache = new_cache
        last_metadata_fetch = time.time()
        logger.info(f"Loaded {len(item_metadata_cache)} items from OSRS Wiki Mapping.")
    except Exception as e:
        logger.error(f"Failed to fetch item mapping: {e}")
        # Return stale cache if available
    return item_metadata_cache

def get_clickhouse_client():
    return clickhouse_connect.get_client(
        host=CLICKHOUSE_HOST,
        port=CLICKHOUSE_PORT,
        username=CLICKHOUSE_USER,
        password=CLICKHOUSE_PASSWORD
    )

# 5 minute cache (300 seconds)
cache = TTLCache(maxsize=1000, ttl=300)

@app.on_event("startup")
def startup_event():
    fetch_item_metadata()

@app.get("/health")
def health():
    try:
        client = get_clickhouse_client()
        client.command('SELECT 1')
        return {"status": "healthy", "clickhouse": "connected"}
    except Exception as e:
        logger.error(f"Healthcheck failed: {e}")
        return {"status": "unhealthy", "clickhouse": "disconnected"}

@app.get("/api/readiness")
def check_readiness():
    try:
        client = get_clickhouse_client()
        raw_count = client.command('SELECT count() FROM default.raw_osrs_prices')
        clean_count = client.command('SELECT count() FROM default.clean_osrs_prices')
        
        metadata = fetch_item_metadata()
        
        return {
            "ready": raw_count > 0 and clean_count > 0 and len(metadata) > 0,
            "raw_count": raw_count,
            "clean_count": clean_count,
            "metadata_count": len(metadata)
        }
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return {"ready": False, "error": str(e)}

@app.get("/api/items")
def get_items():
    metadata = fetch_item_metadata()
    return list(metadata.values())

@app.get("/api/analytics/top-movers")
@cached(cache)
def get_top_movers():
    client = get_clickhouse_client()
    # Clickhouse query to get start and end price in last 24h
    query = """
        SELECT
            item_id,
            argMin(avg_high_price, timestamp) as start_price,
            argMax(avg_high_price, timestamp) as end_price
        FROM default.clean_osrs_prices
        WHERE timestamp >= now() - INTERVAL 24 HOUR
        GROUP BY item_id
        HAVING start_price > 0 AND end_price > 0
    """
    try:
        result = client.query(query)
        rows = result.result_rows
        
        movers = []
        metadata = fetch_item_metadata()
        
        for row in rows:
            item_id = int(row[0])
            start_p = int(row[1])
            end_p = int(row[2])
            
            if start_p == 0:
                continue
                
            pct_change = round(((end_p - start_p) / start_p) * 100, 2)
            item_info = metadata.get(item_id, {})
            
            movers.append({
                "item_id": item_id,
                "name": item_info.get("name", f"Item #{item_id}"),
                "start_price": start_p,
                "end_price": end_p,
                "percent_change": pct_change
            })
            
        # Sort by absolute change descending, limit to top 10
        movers.sort(key=lambda x: abs(x["percent_change"]), reverse=True)
        return {"movers": movers[:10]}
    except Exception as e:
        logger.error(f"Error computing top movers: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/catalogue")
@cached(cache)
def get_catalogue():
    client = get_clickhouse_client()
    query = """
        SELECT
            item_id,
            groupArray(avg_high_price)[1] as latest_high,
            groupArray(avg_low_price)[1] as latest_low,
            groupArray(high_price_volume)[1] as latest_high_vol,
            groupArray(low_price_volume)[1] as latest_low_vol,
            groupArray(avg_high_price)[2] as prev_high,
            groupArray(avg_low_price)[2] as prev_low,
            groupArray(high_price_volume)[2] as prev_high_vol,
            groupArray(low_price_volume)[2] as prev_low_vol
        FROM (
            SELECT * FROM default.clean_osrs_prices
            ORDER BY timestamp DESC
        )
        GROUP BY item_id
    """
    try:
        result = client.query(query)
        rows = result.result_rows
        
        prices_map = {}
        for row in rows:
            item_id = int(row[0])
            
            prices_map[item_id] = [
                {
                    "avg_high_price": int(row[1]) if row[1] is not None else None,
                    "avg_low_price": int(row[2]) if row[2] is not None else None,
                    "high_price_volume": int(row[3]) if row[3] is not None else None,
                    "low_price_volume": int(row[4]) if row[4] is not None else None
                }
            ]
            
            # If we have prev price data
            if row[5] is not None or row[6] is not None:
                prices_map[item_id].append({
                    "avg_high_price": int(row[5]) if row[5] is not None else None,
                    "avg_low_price": int(row[6]) if row[6] is not None else None,
                    "high_price_volume": int(row[7]) if row[7] is not None else None,
                    "low_price_volume": int(row[8]) if row[8] is not None else None
                })

        metadata = fetch_item_metadata()
        items_metadata = []
        for item_id, item_info in metadata.items():
            prices = prices_map.get(item_id, [])
            items_metadata.append({
                "item_id": item_id,
                "name": item_info.get("name"),
                "value": item_info.get("value", 0),
                "item_type": {
                    "type_name": "Misc" # Mocking item type or default to Misc
                },
                "prices": prices
            })
            
        return {"items_metadata": items_metadata}
    except Exception as e:
        logger.error(f"Error computing catalogue: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/analytics/top-stats")
@cached(cache)
def get_top_stats():
    client = get_clickhouse_client()
    
    # Query top volume
    vol_query = """
        SELECT
            item_id,
            avg_high_price,
            high_price_volume,
            low_price_volume
        FROM default.clean_osrs_prices
        ORDER BY high_price_volume DESC
        LIMIT 100
    """
    
    # Query top price
    price_query = """
        SELECT
            item_id,
            avg_high_price,
            high_price_volume,
            low_price_volume
        FROM default.clean_osrs_prices
        ORDER BY avg_high_price DESC
        LIMIT 100
    """
    
    try:
        vol_result = client.query(vol_query).result_rows
        price_result = client.query(price_query).result_rows
        
        metadata = fetch_item_metadata()
        
        def format_rows(rows):
            formatted = []
            for row in rows:
                item_id = int(row[0])
                item_info = metadata.get(item_id, {})
                formatted.append({
                    "item_metadata": {
                        "item_id": item_id,
                        "name": item_info.get("name", f"Item #{item_id}"),
                        "item_type": {
                            "type_name": "Misc"
                        }
                    },
                    "avg_high_price": int(row[1]) if row[1] is not None else None,
                    "high_price_volume": int(row[2]) if row[2] is not None else None,
                    "low_price_volume": int(row[3]) if row[3] is not None else None
                })
            return formatted
            
        return {
            "top_volume": format_rows(vol_result),
            "top_price": format_rows(price_result)
        }
    except Exception as e:
        logger.error(f"Error computing top stats: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/prices/latest/{item_id}")
@cached(cache)
def get_latest_price(item_id: int):
    client = get_clickhouse_client()
    query = f"""
        SELECT 
            item_id,
            avg_high_price,
            avg_low_price,
            high_price_volume,
            low_price_volume,
            toUnixTimestamp(timestamp) as ts
        FROM default.clean_osrs_prices
        WHERE item_id = {item_id}
        ORDER BY timestamp DESC
        LIMIT 1
    """
    try:
        result = client.query(query)
        rows = result.result_rows
        
        if not rows:
            return {
                "item_id": item_id,
                "avg_high_price": None,
                "avg_low_price": None,
                "high_price_volume": None,
                "low_price_volume": None,
                "last_updated": None
            }
            
        row = rows[0]
        return {
            "item_id": int(row[0]),
            "avg_high_price": int(row[1]) if row[1] is not None else None,
            "avg_low_price": int(row[2]) if row[2] is not None else None,
            "high_price_volume": int(row[3]) if row[3] is not None else None,
            "low_price_volume": int(row[4]) if row[4] is not None else None,
            "last_updated": int(row[5])
        }
    except Exception as e:
        logger.error(f"Error querying latest price from clickhouse: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/api/prices/historical/{item_id}")
@cached(cache)
def get_historical_prices(item_id: int):
    client = get_clickhouse_client()
    query = f"""
        SELECT 
            toUnixTimestamp(timestamp) as ts,
            avg_high_price,
            avg_low_price,
            total_volume
        FROM default.gold_osrs_prices
        WHERE item_id = {item_id}
        ORDER BY ts ASC
    """
    
    try:
        result = client.query(query)
        rows = result.result_rows
        
        timestamps = []
        avg_high_prices = []
        avg_low_prices = []
        total_volumes = []
        
        for row in rows:
            timestamps.append(row[0] * 1000) # Convert to JS ms timestamp
            avg_high_prices.append(row[1])
            avg_low_prices.append(row[2])
            total_volumes.append(row[3])
            
        return {
            "item_id": item_id,
            "timestamps": timestamps,
            "avg_high_prices": avg_high_prices,
            "avg_low_prices": avg_low_prices,
            "total_volumes": total_volumes
        }
    except Exception as e:
        logger.error(f"Error querying clickhouse: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
