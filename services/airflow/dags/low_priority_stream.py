import os
import logging
from datetime import datetime
from airflow import DAG
from airflow.operators.python import PythonOperator
import json
import io
import struct

logger = logging.getLogger(__name__)

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 0,
}

def process_low_priority_stream():
    from confluent_kafka import Consumer, KafkaException, KafkaError
    import fastavro
    import pyarrow as pa
    import pyarrow.parquet as pq
    import pyarrow.dataset as ds
    import psycopg2
    from psycopg2.extras import execute_values
    from urllib.parse import urlparse

    # Env vars
    brokers = os.environ.get('REDPANDA_BROKERS', 'redpanda:29092')
    schema_registry_url = os.environ.get('SCHEMA_REGISTRY_URL', 'http://redpanda:8081')
    postgres_host = os.environ.get('POSTGRES_HOST', 'osrs-postgres')
    postgres_db = os.environ.get('POSTGRES_DB', 'osrs_market')
    postgres_user = os.environ.get('POSTGRES_USER', 'postgres')
    postgres_password = os.environ.get('POSTGRES_PASSWORD', 'postgres_secure_pass')
    minio_endpoint = os.environ.get('MINIO_ENDPOINT', 'http://minio:9000')
    minio_user = os.environ.get('MINIO_ROOT_USER', 'minioadmin')
    minio_pass = os.environ.get('MINIO_ROOT_PASSWORD', 'minioadmin_secure_pass')
    
    price_threshold = int(os.environ.get('PRIORITY_PRICE_THRESHOLD', 1000000))
    vol_threshold = int(os.environ.get('PRIORITY_VOLUME_THRESHOLD', 10000))

    # Initialize Consumer
    conf = {
        'bootstrap.servers': brokers,
        'group.id': 'airflow-low-priority',
        'auto.offset.reset': 'earliest',
        'enable.auto.commit': False
    }
    consumer = Consumer(conf)
    consumer.subscribe(['osrs.price-ticks.raw'])

    logger.info("Polling for messages...")
    
    # We will poll until we hit EOF or timeout
    low_priority_items = []
    
    # Avro schema for fastavro (needs to match what the producer sends)
    # The producer uses confluent schema registry, so the payload starts with a 5-byte header.
    # Magic Byte (1) + Schema ID (4) + Avro serialized data.
    # We can fetch the schema from registry or just rely on the bytes.
    # To fetch schema:
    import requests
    schema_url = f"{schema_registry_url}/subjects/osrs.price-ticks.raw-value/versions/latest"
    try:
        resp = requests.get(schema_url, timeout=5)
        schema_str = resp.json()['schema']
        schema = fastavro.parse_schema(json.loads(schema_str))
    except Exception as e:
        logger.error(f"Failed to fetch schema: {e}")
        return

    # Poll loop until queue is drained (max 240 seconds to fit within 5-min schedule)
    start_time = datetime.now()
    while (datetime.now() - start_time).total_seconds() < 240:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            # No more messages right now, we can stop the loop and process what we have
            break
        if msg.error():
            if msg.error().code() == KafkaError._PARTITION_EOF:
                break
            else:
                logger.error(f"Kafka error: {msg.error()}")
                break
        
        # Deserialize Avro payload
        payload = msg.value()
        if payload is None:
            continue
            
        # Confluent wire format: 1 byte magic + 4 byte schema ID
        magic, schema_id = struct.unpack('>bI', payload[:5])
        avro_data = payload[5:]
        
        try:
            record = fastavro.schemaless_reader(io.BytesIO(avro_data), schema)
        except Exception as e:
            logger.error(f"Avro deserialization failed: {e}")
            continue
            
        # Extract fields
        avg_high_price = record.get('avg_high_price') or 0
        avg_low_price = record.get('avg_low_price') or 0
        high_vol = record.get('high_price_volume') or 0
        low_vol = record.get('low_price_volume') or 0
        
        # Priority filter (inclusive of low priority)
        if avg_high_price <= price_threshold and (high_vol + low_vol) <= vol_threshold:
            dt = datetime.fromtimestamp(record['timestamp'] / 1000.0)
            low_priority_items.append({
                'item_id': record['item_id'],
                'timestamp': record['timestamp'],
                'avg_high_price': avg_high_price if avg_high_price else None,
                'high_price_volume': high_vol if high_vol else None,
                'avg_low_price': avg_low_price if avg_low_price else None,
                'low_price_volume': low_vol if low_vol else None,
                'year': dt.year,
                'month': dt.month,
                'day': dt.day,
                'last_updated': dt.strftime('%Y-%m-%d %H:%M:%S')
            })

    # If no items, just exit and commit
    if not low_priority_items:
        logger.info("No low-priority items found.")
        consumer.commit()
        consumer.close()
        return

    logger.info(f"Processing {len(low_priority_items)} low-priority items...")

    # Write to Postgres
    conn = psycopg2.connect(
        host=postgres_host,
        dbname=postgres_db,
        user=postgres_user,
        password=postgres_password
    )
    cur = conn.cursor()
    
    # We only want the latest per item_id
    latest_items = {}
    for item in low_priority_items:
        latest_items[item['item_id']] = item
        
    upsert_query = """
        INSERT INTO public.latest_item_prices 
        (item_id, avg_high_price, avg_low_price, high_price_volume, low_price_volume, last_updated)
        VALUES %s
        ON CONFLICT (item_id) DO UPDATE SET
            avg_high_price = EXCLUDED.avg_high_price,
            avg_low_price = EXCLUDED.avg_low_price,
            high_price_volume = EXCLUDED.high_price_volume,
            low_price_volume = EXCLUDED.low_price_volume,
            last_updated = EXCLUDED.last_updated;
    """
    
    values = [
        (
            item['item_id'],
            item['avg_high_price'],
            item['avg_low_price'],
            item['high_price_volume'],
            item['low_price_volume'],
            item['last_updated']
        )
        for item in latest_items.values()
    ]
    
    execute_values(cur, upsert_query, values)
    conn.commit()
    cur.close()
    conn.close()
    logger.info("Upserted to PostgreSQL.")

    # Write to MinIO S3 using PyArrow
    import urllib.parse
    s3_endpoint = minio_endpoint.replace('http://', '').replace('https://', '')
    
    # Need to configure PyArrow S3FileSystem
    from pyarrow import fs
    s3_fs = fs.S3FileSystem(
        endpoint_override=s3_endpoint,
        access_key=minio_user,
        secret_key=minio_pass,
        scheme='http'
    )
    
    # Convert to Table
    table = pa.Table.from_pylist(low_priority_items)
    
    # Partitioned write
    pq.write_to_dataset(
        table,
        root_path='osrs-parquet/ticks',
        partition_cols=['year', 'month', 'day'],
        filesystem=s3_fs,
        existing_data_behavior='overwrite_or_ignore'
    )
    logger.info("Wrote to MinIO Parquet files.")

    # Commit Kafka offsets
    consumer.commit()
    consumer.close()
    logger.info("Finished low priority processing.")

with DAG(
    'low_priority_stream',
    default_args=default_args,
    description='Process low-priority OSRS price ticks',
    schedule_interval='*/5 * * * *',
    catchup=False,
    max_active_runs=1,
) as dag:

    process_task = PythonOperator(
        task_id='process_low_priority_items',
        python_callable=process_low_priority_stream,
    )
