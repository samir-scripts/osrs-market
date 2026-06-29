import time
import requests
import asyncio
import logging
from config import config
from kafka_client import kafka_client
from osrs_client import osrs_client

logger = logging.getLogger(__name__)

class Scheduler:
    def __init__(self):
        self.is_running = True
        self.polling_task = None
        self.current_status = "online"
        self.last_fetched_at = 0
        self.next_update_at = 0

    def _send_webhook(self, event_type: str, payload: dict):
        if not config.WEBHOOK_URL:
            logger.info(f"No WEBHOOK_URL configured. Skipping {event_type} webhook notify.")
            return
        logger.info(f"Firing {event_type} webhook to {config.WEBHOOK_URL}...")
        try:
            response = requests.post(config.WEBHOOK_URL, json=payload, timeout=2.0)
            logger.info(f"Webhook response for {event_type}: {response.status_code}")
        except Exception as e:
            logger.error(f"Error firing {event_type} webhook: {e}")

    def _fire_data_updated_webhook(self):
        self._send_webhook("data_updated", {
            "event": "data_updated",
            "fetched_at": self.last_fetched_at,
            "next_update_at": self.next_update_at
        })

    def _fire_status_webhook(self, status: str):
        self._send_webhook(f"status_update ({status})", {
            "event": "status_update",
            "status": status
        })

    async def polling_loop(self):
        logger.info("Starting polling loop background task...")
        
        await asyncio.sleep(10)
        
        while self.is_running:
            sleep_time = config.POLL_INTERVAL_SEC
            try:
                if not kafka_client.producer:
                    kafka_client.initialize()
                
                success = osrs_client.fetch_and_produce_prices()
                if success:
                    self.last_fetched_at = int(time.time())
                    self.next_update_at = self.last_fetched_at + config.POLL_INTERVAL_SEC
                    self._fire_data_updated_webhook()
                    
                    if self.current_status == "offline":
                        self.current_status = "online"
                        self._fire_status_webhook("online")
                    sleep_time = config.POLL_INTERVAL_SEC
                else:
                    if self.current_status == "online":
                        self.current_status = "offline"
                        self._fire_status_webhook("offline")
                    sleep_time = 8
            except Exception as e:
                logger.error(f"Exception in polling loop: {e}")
                if self.current_status == "online":
                    self.current_status = "offline"
                    self._fire_status_webhook("offline")
                sleep_time = 8
                
            logger.info(f"Sleeping for {sleep_time} seconds...")
            for _ in range(sleep_time):
                if not self.is_running:
                    break
                await asyncio.sleep(1)

    def start(self):
        self.is_running = True
        self.polling_task = asyncio.create_task(self.polling_loop())

    def stop(self):
        self.is_running = False
        if self.polling_task:
            self.polling_task.cancel()

scheduler = Scheduler()
