import time
import logging
import requests
from config import config
from kafka_client import kafka_client

logger = logging.getLogger(__name__)

class OSRSClient:
    def fetch_and_produce_prices(self) -> bool:
        url = "https://prices.runescape.wiki/api/v1/osrs/5m"
        headers = {"User-Agent": config.USER_AGENT}
        
        logger.info(f"Fetching OSRS prices from {url}...")
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            payload = response.json()
        except Exception as e:
            logger.error(f"Error fetching prices: {e}")
            return False

        data = payload.get("data", {})
        timestamp = payload.get("timestamp", int(time.time()))
        
        logger.info(f"Fetched {len(data)} price ticks. Streaming to Redpanda...")
        
        count = 0
        for item_id_str, tick in data.items():
            try:
                item_id = int(item_id_str)
                record = {
                    "item_id": item_id,
                    "timestamp": timestamp,
                    "avg_high_price": tick.get("avgHighPrice"),
                    "high_price_volume": tick.get("highPriceVolume"),
                    "avg_low_price": tick.get("avgLowPrice"),
                    "low_price_volume": tick.get("lowPriceVolume")
                }
                
                kafka_client.produce(
                    topic="osrs.price-ticks.raw",
                    key=str(item_id),
                    value=record
                )
                count += 1
            except Exception as ex:
                logger.error(f"Failed to produce record for item {item_id_str}: {ex}")
                
        kafka_client.flush()
        logger.info(f"Successfully flushed {count} records to topic: osrs.price-ticks.raw")
        return True

osrs_client = OSRSClient()
