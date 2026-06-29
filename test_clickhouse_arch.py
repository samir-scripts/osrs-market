import urllib.request
import urllib.error
import time
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CLICKHOUSE_URL = 'http://localhost:8123'

def query_clickhouse(sql):
    import base64
    auth_b64 = base64.b64encode(b"default:default").decode("utf-8")
    req = urllib.request.Request(CLICKHOUSE_URL, data=sql.encode('utf-8'), method='POST')
    req.add_header("Authorization", f"Basic {auth_b64}")
    try:
        with urllib.request.urlopen(req) as response:
            text = response.read().decode('utf-8')
            if text.strip():
                return [row.split('\t') for row in text.strip().split('\n')]
            return []
    except urllib.error.URLError as e:
        logger.debug(f"ClickHouse query failed: {e}")
        raise e

def main():
    logger.info("Waiting for ClickHouse to ingest data from Kafka...")
    
    # Wait up to 60 seconds for data to appear
    for i in range(12):
        try:
            raw_count = query_clickhouse("SELECT count() FROM osrs.raw_osrs_prices")
            if raw_count and int(raw_count[0][0]) > 0:
                logger.info(f"Success! Found {raw_count[0][0]} rows in osrs.raw_osrs_prices (Bronze).")
                break
        except Exception as e:
            logger.debug(f"ClickHouse not ready or query failed: {e}")
            
        time.sleep(5)
    else:
        logger.error("No data found in osrs.raw_osrs_prices after 60 seconds. Check Kafka ingestion.")
        return

    # Check Clean (Silver)
    try:
        clean_count = query_clickhouse("SELECT count() FROM osrs.clean_osrs_prices")
        logger.info(f"Found {clean_count[0][0]} rows in osrs.clean_osrs_prices (Silver).")
    except Exception as e:
        logger.error(f"Failed to query clean_osrs_prices: {e}")

    # Check Gold
    try:
        gold_count = query_clickhouse("SELECT count() FROM osrs.gold_osrs_prices_daily")
        logger.info(f"Found {gold_count[0][0]} rows in osrs.gold_osrs_prices_daily (Gold).")
    except Exception as e:
        logger.error(f"Failed to query gold_osrs_prices_daily: {e}")

if __name__ == "__main__":
    main()
