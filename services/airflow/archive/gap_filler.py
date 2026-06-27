import os
import logging
from datetime import datetime
import time
import requests
from airflow import DAG
from airflow.operators.python import PythonOperator

logger = logging.getLogger(__name__)

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 0,
}

def fill_gaps():
    from confluent_kafka import SerializingProducer
    from confluent_kafka.serialization import StringSerializer
    from confluent_kafka.schema_registry import SchemaRegistryClient
    from confluent_kafka.schema_registry.avro import AvroSerializer
    import psycopg2

    # Environment variables
    brokers = os.environ.get('REDPANDA_BROKERS', 'redpanda:29092')
    schema_registry_url = os.environ.get('SCHEMA_REGISTRY_URL', 'http://redpanda:8081')
    postgres_host = os.environ.get('POSTGRES_HOST', 'osrs-postgres')
    postgres_db = os.environ.get('POSTGRES_DB', 'osrs_market')
    postgres_user = os.environ.get('POSTGRES_USER', 'postgres')
    postgres_password = os.environ.get('POSTGRES_PASSWORD', 'postgres_secure_pass')

    # Connect to Postgres to get MAX(last_updated)
    try:
        conn = psycopg2.connect(
            host=postgres_host,
            dbname=postgres_db,
            user=postgres_user,
            password=postgres_password
        )
        cur = conn.cursor()
        cur.execute("SELECT MAX(last_updated) FROM public.latest_item_prices;")
        result = cur.fetchone()
        max_ts = result[0]
        cur.close()
        conn.close()
    except Exception as e:
        logger.error(f"Failed to connect to postgres: {e}")
        return

    if not max_ts:
        logger.info("No data in postgres, cannot determine gap.")
        return

    max_epoch = int(max_ts.timestamp())
    current_epoch = int(time.time())

    # Round max_epoch down to nearest 5m (300s)
    max_epoch_rounded = max_epoch - (max_epoch % 300)
    current_epoch_rounded = current_epoch - (current_epoch % 300)

    missing_intervals = []
    # Start checking from the interval AFTER max_epoch_rounded
    check_epoch = max_epoch_rounded + 300
    while check_epoch < current_epoch_rounded:
        missing_intervals.append(check_epoch)
        check_epoch += 300

    if not missing_intervals:
        logger.info("No gaps found.")
        return

    # To respect rate limits, only process max 12 intervals (1 hour) per run
    process_intervals = missing_intervals[:12]
    logger.info(f"Found {len(missing_intervals)} missing intervals. Processing {len(process_intervals)} this run.")

    # Initialize Schema Registry and Kafka Producer
    sr_client = SchemaRegistryClient({"url": schema_registry_url})
    
    # Fetch the schema dynamically
    schema_url = f"{schema_registry_url}/subjects/osrs.price-ticks.raw-value/versions/latest"
    try:
        resp = requests.get(schema_url, timeout=5)
        schema_str = resp.json()['schema']
    except Exception as e:
        logger.error(f"Failed to fetch schema: {e}")
        return

    avro_serializer = AvroSerializer(
        schema_registry_client=sr_client,
        schema_str=schema_str,
        to_dict=lambda obj, ctx: obj
    )

    producer_config = {
        "bootstrap.servers": brokers,
        "key.serializer": StringSerializer("utf_8"),
        "value.serializer": avro_serializer,
        "acks": "all",
    }
    producer = SerializingProducer(producer_config)

    headers = {"User-Agent": "OSRS Price Tracker Gap Filler - @DevelopmentSandbox"}

    for ts in process_intervals:
        url = f"https://prices.runescape.wiki/api/v1/osrs/5m?timestamp={ts}"
        logger.info(f"Fetching gap data for timestamp {ts}: {url}")
        try:
            res = requests.get(url, headers=headers, timeout=10)
            res.raise_for_status()
            payload = res.json()
            data = payload.get("data", {})
            
            count = 0
            for item_id_str, tick in data.items():
                item_id = int(item_id_str)
                # OSRS API timestamp for this specific tick
                record = {
                    "item_id": item_id,
                    "timestamp": payload.get("timestamp", ts) * 1000, # Assuming avro expects ms
                    "avg_high_price": tick.get("avgHighPrice"),
                    "high_price_volume": tick.get("highPriceVolume"),
                    "avg_low_price": tick.get("avgLowPrice"),
                    "low_price_volume": tick.get("lowPriceVolume")
                }
                producer.produce(
                    topic="osrs.price-ticks.raw",
                    key=str(item_id),
                    value=record
                )
                count += 1
            producer.flush()
            logger.info(f"Successfully produced {count} records for gap {ts}")
            
            # Rate limit sleep
            time.sleep(1)
            
        except Exception as e:
            logger.error(f"Failed to fetch or produce gap data for {ts}: {e}")

with DAG(
    'osrs_gap_filler',
    default_args=default_args,
    description='Fill data gaps in OSRS price ticks every 5 minutes',
    schedule_interval='*/5 * * * *',
    catchup=False,
    max_active_runs=1,
) as dag:
    fill_gaps_task = PythonOperator(
        task_id='fill_gaps',
        python_callable=fill_gaps,
    )
