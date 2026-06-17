import os
import random
import logging
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import duckdb
import psycopg2

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

    logger.info("Connecting to Postgres to fetch items metadata...")
    items = []
    try:
        conn_pg = psycopg2.connect(
            host=postgres_host,
            database=postgres_db,
            user=postgres_user,
            password=postgres_password
        )
        cursor = conn_pg.cursor()
        cursor.execute("SELECT item_id, name, value FROM public.items_metadata;")
        rows = cursor.fetchall()
        for r in rows:
            items.append({
                "item_id": r[0],
                "name": r[1],
                "value": r[2] or 100 # default price if value is null
            })
        cursor.close()
        conn_pg.close()
        logger.info(f"Successfully fetched {len(items)} items from Postgres.")
    except Exception as e:
        logger.warning(f"Failed to fetch items from Postgres: {e}. Using fallback item list.")

    # Fallback items if Postgres is empty or connection fails
    if not items:
        fallback_ids = [2, 13457, 5014, 1363, 5096, 2128, 4298, 5497, 12622, 2472, 10006, 1781]
        for fid in fallback_ids:
            items.append({
                "item_id": fid,
                "name": f"Item #{fid}",
                "value": random.randint(10, 10000)
            })
        logger.info(f"Populated fallback list with {len(items)} items.")

    logger.info("Generating OSRS price tick history (random walk) for the last 30 days...")
    
    # We will generate data points every 4 hours for 30 days.
    # 30 days * 6 points/day = 180 points per item.
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    ticks_data = []
    
    for item in items:
        item_id = item["item_id"]
        current_price = item["value"]
        
        current_time = start_date
        while current_time <= end_date:
            # Random walk: price changes by up to +/- 5%
            change_percent = random.uniform(-0.05, 0.05)
            # Cap the minimum price to 1gp
            current_price = max(1.0, current_price * (1 + change_percent))
            
            avg_high = int(current_price)
            avg_low = int(max(1.0, current_price * random.uniform(0.95, 0.99)))
            high_vol = random.randint(10, 5000)
            low_vol = random.randint(10, 5000)
            
            timestamp_epoch = int(current_time.timestamp())
            
            # Partition variables
            year_val = current_time.year
            month_val = current_time.month
            day_val = current_time.day
            
            ticks_data.append((
                item_id,
                timestamp_epoch,
                avg_high,
                high_vol,
                avg_low,
                low_vol,
                year_val,
                month_val,
                day_val
            ))
            
            current_time += timedelta(hours=4)

    logger.info(f"Generated {len(ticks_data)} ticks in total. Writing to MinIO using DuckDB...")
    
    # Initialize DuckDB connection
    conn_db = duckdb.connect()
    
    # Install and load HTTPFS extension for S3 support
    conn_db.execute("INSTALL httpfs;")
    conn_db.execute("LOAD httpfs;")
    
    # Configure S3 options for MinIO
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
    
    # Create local table and insert data
    conn_db.execute("""
        CREATE TABLE ticks (
            item_id INTEGER,
            timestamp BIGINT,
            avg_high_price BIGINT,
            high_price_volume BIGINT,
            avg_low_price BIGINT,
            low_price_volume BIGINT,
            year INTEGER,
            month INTEGER,
            day INTEGER
        );
    """)
    
    # Insert in chunks of 50,000 rows to prevent memory/statement size issues
    chunk_size = 50000
    for i in range(0, len(ticks_data), chunk_size):
        chunk = ticks_data[i:i + chunk_size]
        conn_db.executemany("INSERT INTO ticks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", chunk)
        logger.info(f"Loaded chunk {i//chunk_size + 1} ({len(chunk)} rows) into DuckDB memory.")

    # Export partitioned parquet directly to MinIO
    logger.info("Executing DuckDB COPY to partition and write Parquet files to MinIO...")
    copy_sql = "COPY ticks TO 's3://osrs-parquet/ticks/' (FORMAT PARQUET, PARTITION_BY (year, month, day), OVERWRITE_OR_IGNORE 1);"
    conn_db.execute(copy_sql)
    logger.info("Backfill successfully completed and saved to MinIO!")
    
    conn_db.close()

with DAG(
    'osrs_backfill_30_days',
    default_args=default_args,
    description='Seeding 30 days of historical price ticks to MinIO',
    schedule_interval=None, # Manual trigger only
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
