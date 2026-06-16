import os
import requests
import json
import logging
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from confluent_kafka import Producer

logger = logging.getLogger(__name__)

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

def fetch_and_sync_metadata():
    url = "https://prices.runescape.wiki/api/v1/osrs/mapping"
    headers = {"User-Agent": "OSRS Price Tracker - @DevelopmentSandbox"}
    
    logger.info(f"Fetching OSRS item mapping from {url}")
    response = requests.get(url, headers=headers, timeout=30)
    response.raise_for_status()
    mapping_data = response.json()
    logger.info(f"Fetched {len(mapping_data)} items.")
    
    # 1. Sync directly to PostgreSQL
    import psycopg2
    postgres_host = os.getenv("POSTGRES_HOST", "osrs-postgres")
    postgres_db = os.getenv("POSTGRES_DB", "osrs_market")
    postgres_user = os.getenv("POSTGRES_USER", "postgres")
    postgres_password = os.getenv("POSTGRES_PASSWORD", "postgres_secure_pass")
    
    conn = psycopg2.connect(
        host=postgres_host,
        database=postgres_db,
        user=postgres_user,
        password=postgres_password
    )
    cursor = conn.cursor()
    
    logger.info("Upserting items into Postgres...")
    upsert_query = """
        INSERT INTO public.items_metadata (
            item_id, name, examine, members, value, high_alch, low_alch, buy_limit, last_synced
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        ON CONFLICT (item_id) DO UPDATE SET
            name = EXCLUDED.name,
            examine = EXCLUDED.examine,
            members = EXCLUDED.members,
            value = EXCLUDED.value,
            high_alch = EXCLUDED.high_alch,
            low_alch = EXCLUDED.low_alch,
            buy_limit = EXCLUDED.buy_limit,
            last_synced = CURRENT_TIMESTAMP;
    """
    
    records = []
    for item in mapping_data:
        records.append((
            item.get("id"),
            item.get("name"),
            item.get("examine"),
            item.get("members", False),
            item.get("value"),
            item.get("highalch"),
            item.get("lowalch"),
            item.get("limit")
        ))
        
    # Batch upserts
    cursor.executemany(upsert_query, records)
    conn.commit()
    cursor.close()
    conn.close()
    logger.info("Postgres items_metadata sync completed successfully.")
    
    # 2. Optionally push to Redpanda Compacted Topic osrs.items.metadata
    brokers = os.getenv("REDPANDA_BROKERS", "redpanda:29092")
    try:
        producer = Producer({"bootstrap.servers": brokers})
        logger.info(f"Producing metadata changes to Redpanda topic osrs.items.metadata...")
        for item in mapping_data:
            item_id = str(item.get("id"))
            producer.produce(
                topic="osrs.items.metadata",
                key=item_id,
                value=json.dumps(item)
            )
        producer.flush()
        logger.info("Redpanda items_metadata sync completed successfully.")
    except Exception as e:
        logger.warning(f"Failed to produce to Redpanda: {e}. Postgres sync was still successful.")

with DAG(
    'osrs_metadata_sync',
    default_args=default_args,
    description='Sync OSRS item mapping metadata to Postgres & Redpanda daily',
    schedule_interval='@daily',
    catchup=False,
) as dag:

    sync_task = PythonOperator(
        task_id='sync_metadata',
        python_callable=fetch_and_sync_metadata,
    )
