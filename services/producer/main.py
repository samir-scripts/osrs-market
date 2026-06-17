import asyncio
import os
import time
import logging
import requests
import socket
from fastapi import FastAPI, BackgroundTasks
from prometheus_fastapi_instrumentator import Instrumentator
from confluent_kafka import SerializingProducer
from confluent_kafka.serialization import StringSerializer
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.avro import AvroSerializer

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="OSRS Market Ingestion Producer", version="1.0")

# Instrument Prometheus metrics
Instrumentator().instrument(app).expose(app)

# Environment variables
REDPANDA_BROKERS = os.getenv("REDPANDA_BROKERS", "redpanda:29092")
SCHEMA_REGISTRY_URL = os.getenv("SCHEMA_REGISTRY_URL", "http://redpanda:8081")
POLL_INTERVAL_SEC = int(os.getenv("POLL_INTERVAL_SEC", "300"))
USER_AGENT = os.getenv("USER_AGENT", "OSRS Price Tracker - @DevelopmentSandbox")
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")

# Globals
producer = None
polling_task = None
is_running = True
last_fetched_at = 0
next_update_at = 0
current_status = "online"


def load_avro_schema():
    schema_path = os.path.join(os.path.dirname(__file__), "schemas", "price_tick.avsc")
    with open(schema_path, "r") as f:
        return f.read()

def init_kafka_producer():
    global producer
    logger.info(f"Initializing Schema Registry client at {SCHEMA_REGISTRY_URL}")
    sr_client = SchemaRegistryClient({"url": SCHEMA_REGISTRY_URL})
    
    schema_str = load_avro_schema()
    avro_serializer = AvroSerializer(
        schema_registry_client=sr_client,
        schema_str=schema_str,
        to_dict=lambda obj, ctx: obj
    )
    
    producer_config = {
        "bootstrap.servers": REDPANDA_BROKERS,
        "key.serializer": StringSerializer("utf_8"),
        "value.serializer": avro_serializer,
        # Ensure message durability
        "acks": "all",
        "retries": 5,
        "retry.backoff.ms": 500
    }
    
    logger.info(f"Initializing Kafka producer with brokers {REDPANDA_BROKERS}")
    producer = SerializingProducer(producer_config)

def delivery_report(err, msg):
    if err is not None:
        logger.error(f"Message delivery failed: {err}")
    else:
        # Avoid spamming log for every item, but log occasionally or on success/fail details
        pass

def check_internet_connection() -> bool:
    for host in [("8.8.8.8", 53), ("1.1.1.1", 53)]:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2.0)
            s.connect(host)
            s.close()
            return True
        except Exception as e:
            logger.debug(f"Failed to connect to {host}: {e}")
            continue
    return False

def fetch_and_produce_prices() -> bool:
    if not check_internet_connection():
        logger.warning("Internet connectivity check failed. Server is offline.")
        return False

    if producer is None:
        logger.warning("Producer not initialized. Skipping poll.")
        return False
        
    url = "https://prices.runescape.wiki/api/v1/osrs/5m"
    headers = {"User-Agent": USER_AGENT}
    
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
            # Match schema: item_id, timestamp, avg_high_price, high_price_volume, avg_low_price, low_price_volume
            record = {
                "item_id": item_id,
                "timestamp": timestamp,
                "avg_high_price": tick.get("avgHighPrice"),
                "high_price_volume": tick.get("highPriceVolume"),
                "avg_low_price": tick.get("avgLowPrice"),
                "low_price_volume": tick.get("lowPriceVolume")
            }
            
            producer.produce(
                topic="osrs.price-ticks.raw",
                key=str(item_id),
                value=record,
                on_delivery=delivery_report
            )
            count += 1
        except Exception as ex:
            logger.error(f"Failed to produce record for item {item_id_str}: {ex}")
            
    producer.flush()
    logger.info(f"Successfully flushed {count} records to topic: osrs.price-ticks.raw")
    
    global last_fetched_at, next_update_at
    last_fetched_at = int(time.time())
    next_update_at = last_fetched_at + POLL_INTERVAL_SEC
    _fire_webhook()
    return True

def _send_webhook(event_type: str, payload: dict):
    if not WEBHOOK_URL:
        logger.info(f"No WEBHOOK_URL configured. Skipping {event_type} webhook notify.")
        return
    logger.info(f"Firing {event_type} webhook to {WEBHOOK_URL}...")
    try:
        response = requests.post(WEBHOOK_URL, json=payload, timeout=2.0)
        logger.info(f"Webhook response for {event_type}: {response.status_code}")
    except Exception as e:
        logger.error(f"Error firing {event_type} webhook: {e}")

def _fire_webhook():
    _send_webhook("data_updated", {
        "event": "data_updated",
        "fetched_at": last_fetched_at,
        "next_update_at": next_update_at
    })

def _fire_status_webhook(status: str):
    _send_webhook(f"status_update ({status})", {
        "event": "status_update",
        "status": status
    })

async def polling_loop():
    global is_running, current_status
    logger.info("Starting polling loop background task...")
    
    # Wait for Schema Registry and Redpanda to be fully up and ready
    await asyncio.sleep(10)
    
    while is_running:
        sleep_time = POLL_INTERVAL_SEC
        try:
            if producer is None:
                init_kafka_producer()
            
            success = fetch_and_produce_prices()
            if success:
                if current_status == "offline":
                    current_status = "online"
                    _fire_status_webhook("online")
                sleep_time = POLL_INTERVAL_SEC
            else:
                if current_status == "online":
                    current_status = "offline"
                _fire_status_webhook("offline")
                sleep_time = 8
        except Exception as e:
            logger.error(f"Exception in polling loop: {e}")
            if current_status == "online":
                current_status = "offline"
            _fire_status_webhook("offline")
            sleep_time = 8
            
        logger.info(f"Sleeping for {sleep_time} seconds...")
        # Check is_running periodically during sleep to support quick shutdown
        for _ in range(sleep_time):
            if not is_running:
                break
            await asyncio.sleep(1)

@app.on_event("startup")
def startup_event():
    global polling_task
    polling_task = asyncio.create_task(polling_loop())

@app.on_event("shutdown")
def shutdown_event():
    global is_running, polling_task
    logger.info("Shutting down service...")
    is_running = False
    if polling_task:
        polling_task.cancel()
    logger.info("Service shutdown completed.")

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "producer_initialized": producer is not None,
        "is_running": is_running,
        "connection_status": current_status
    }

@app.post("/trigger")
def trigger_poll(background_tasks: BackgroundTasks):
    background_tasks.add_task(fetch_and_produce_prices)
    return {"status": "triggered"}

@app.get("/schedule")
def get_schedule():
    return {
        "last_fetched_at": last_fetched_at,
        "next_update_at": next_update_at,
        "poll_interval_sec": POLL_INTERVAL_SEC,
        "connection_status": current_status
    }
