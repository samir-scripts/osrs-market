import os
import time
import logging
from datetime import datetime, timedelta, timezone
import requests
from airflow import DAG
from airflow.operators.python import PythonOperator
import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.dataset as ds
from pyarrow import fs
import uuid

logger = logging.getLogger(__name__)

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 0,
}

def backfill_data():
    postgres_host = os.getenv("POSTGRES_HOST", "osrs-postgres")
    postgres_db = os.getenv("POSTGRES_DB", "osrs_market")
    postgres_user = os.getenv("POSTGRES_USER", "postgres")
    postgres_password = os.getenv("POSTGRES_PASSWORD", "postgres_secure_pass")
    
    minio_endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
    minio_user = os.getenv("MINIO_ROOT_USER", "minioadmin")
    minio_password = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin_secure_pass")
    user_agent = os.getenv("USER_AGENT", "OSRS Price Tracker - @DevelopmentSandbox")

    # Set up DuckDB connection to query existing timestamps in MinIO S3
    conn_db = duckdb.connect()
    conn_db.execute("INSTALL httpfs;")
    conn_db.execute("LOAD httpfs;")
    
    if minio_endpoint.startswith("http://"):
        minio_endpoint_clean = minio_endpoint[7:]
    elif minio_endpoint.startswith("https://"):
        minio_endpoint_clean = minio_endpoint[8:]
    else:
        minio_endpoint_clean = minio_endpoint
        
    conn_db.execute(f"SET s3_endpoint='{minio_endpoint_clean}';")
    conn_db.execute(f"SET s3_access_key_id='{minio_user}';")
    conn_db.execute(f"SET s3_secret_access_key='{minio_password}';")
    conn_db.execute("SET s3_use_ssl=false;")
    conn_db.execute("SET s3_url_style='path';")

    # Calculate expected 5-minute timestamps for the last 30 days
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(days=30)
    
    # 5-minute ticks alignment (timestamp should be divisible by 300)
    start_ts = int(start_time.timestamp() // 300) * 300
    end_ts = int(now.timestamp() // 300) * 300
    
    expected_ts = set(range(start_ts, end_ts, 300))
    logger.info(f"Calculated {len(expected_ts)} expected 5-minute timestamps from {start_ts} to {end_ts}.")

    # Query existing timestamps in MinIO S3
    try:
        existing_res = conn_db.execute(
            "SELECT DISTINCT timestamp FROM read_parquet('s3://osrs-parquet/ticks/**/*.parquet') WHERE timestamp >= ?",
            [start_ts]
        ).fetchall()
        existing_ts = {r[0] for r in existing_res}
        logger.info(f"Found {len(existing_ts)} existing timestamps in S3 for the last 30 days.")
    except Exception as e:
        logger.warning(f"Error querying existing parquet files from S3: {e}. Assuming no data exists.")
        existing_ts = set()

    conn_db.close()

    # Calculate missing intervals
    missing_ts = sorted(list(expected_ts - existing_ts))
    logger.info(f"Total missing timestamps to backfill: {len(missing_ts)}")

    if not missing_ts:
        logger.info("No gaps in OSRS market data detected. Backfill is fully up to date.")
        return

    # Process a batch of missing timestamps (limit to 288, which is 1 day's worth)
    batch_size = 288
    batch = missing_ts[:batch_size]
    logger.info(f"Processing batch of {len(batch)} timestamps in this run.")

    headers = {"User-Agent": user_agent}
    ticks_data = []

    for idx, ts in enumerate(batch):
        url = f"https://prices.runescape.wiki/api/v1/osrs/5m?timestamp={ts}"
        logger.info(f"[{idx+1}/{len(batch)}] Fetching OSRS prices for timestamp {ts} ({datetime.fromtimestamp(ts, tz=timezone.utc)})")
        
        try:
            # Respect rate limits: max 1 req/sec
            time.sleep(1.5)
            
            response = requests.get(url, headers=headers, timeout=10)
            if response.status_code == 404:
                logger.warning(f"OSRS API returned 404 for timestamp {ts}. Recording dummy row.")
                data = {}
            else:
                response.raise_for_status()
                payload = response.json()
                data = payload.get("data", {})
        except Exception as e:
            logger.error(f"Failed to fetch OSRS prices for timestamp {ts}: {e}")
            if getattr(e, 'response', None) is not None and e.response.status_code == 429:
                logger.error("Hit rate limit 429. Stopping batch fetch early.")
                break
            continue

        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        year_val = dt.year
        month_val = dt.month
        day_val = dt.day

        if not data:
            # Write a dummy row so we don't retry this timestamp forever
            ticks_data.append({
                "item_id": -1,
                "timestamp": ts,
                "avg_high_price": None,
                "high_price_volume": None,
                "avg_low_price": None,
                "low_price_volume": None,
                "year": year_val,
                "month": month_val,
                "day": day_val
            })
        else:
            for item_id_str, tick in data.items():
                try:
                    item_id = int(item_id_str)
                    avg_high = tick.get("avgHighPrice")
                    high_vol = tick.get("highPriceVolume")
                    avg_low = tick.get("avgLowPrice")
                    low_vol = tick.get("lowPriceVolume")
                    
                    ticks_data.append({
                        "item_id": item_id,
                        "timestamp": ts,
                        "avg_high_price": avg_high,
                        "high_price_volume": high_vol,
                        "avg_low_price": avg_low,
                        "low_price_volume": low_vol,
                        "year": year_val,
                        "month": month_val,
                        "day": day_val
                    })
                except Exception as item_ex:
                    logger.error(f"Failed to parse tick for item {item_id_str} at timestamp {ts}: {item_ex}")

    if not ticks_data:
        logger.info("No ticks were fetched in this batch.")
        return

    logger.info(f"Writing {len(ticks_data)} ticks to MinIO using PyArrow...")
    
    try:
        s3_fs = fs.S3FileSystem(
            endpoint_override=minio_endpoint_clean,
            access_key=minio_user,
            secret_key=minio_password,
            scheme='http'
        )
        
        table = pa.Table.from_pylist(ticks_data)
        
        ds.write_dataset(
            table,
            base_dir='osrs-parquet/ticks',
            format='parquet',
            partitioning=['year', 'month', 'day'],
            filesystem=s3_fs,
            existing_data_behavior='overwrite_or_ignore',
            basename_template=f"backfill_{int(time.time())}_{uuid.uuid4().hex[:8]}_{{i}}.parquet"
        )
        logger.info("Successfully wrote batch data to MinIO!")
    except Exception as pyarrow_ex:
        logger.error(f"Failed to write to MinIO using PyArrow: {pyarrow_ex}")
        raise

with DAG(
    'osrs_backfill_30_days',
    default_args=default_args,
    description='Incrementally seeding 30 days of historical price ticks from OSRS Wiki API to MinIO',
    schedule_interval='@hourly',
    catchup=False,
) as dag:

    backfill_task = PythonOperator(
        task_id='run_backfill',
        python_callable=backfill_data,
    )

if __name__ == "__main__":
    # Setup standard logging to console for direct execution
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    backfill_data()
