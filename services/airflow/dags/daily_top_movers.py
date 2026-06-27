import os
import logging
import duckdb
import psycopg2
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator

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

def compute_daily_top_movers():
    # 1. Fetch config from env
    minio_endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
    minio_user = os.getenv("MINIO_ROOT_USER", "minioadmin")
    minio_password = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin_secure_pass")
    
    postgres_host = os.getenv("POSTGRES_HOST", "osrs-postgres")
    postgres_db = os.getenv("POSTGRES_DB", "osrs_market")
    postgres_user = os.getenv("POSTGRES_USER", "postgres")
    postgres_password = os.getenv("POSTGRES_PASSWORD", "postgres_secure_pass")

    # 2. Connect to DuckDB
    logger.info("Initializing DuckDB connection...")
    db_conn = duckdb.connect()
    db_conn.execute("INSTALL httpfs;")
    db_conn.execute("LOAD httpfs;")
    
    # Configure S3 endpoint
    endpoint = minio_endpoint
    use_ssl = "false"
    if endpoint.startswith("http://"):
        endpoint = endpoint[7:]
    elif endpoint.startswith("https://"):
        endpoint = endpoint[8:]
        use_ssl = "true"
        
    db_conn.execute(f"SET s3_endpoint='{endpoint}';")
    db_conn.execute(f"SET s3_access_key_id='{minio_user}';")
    db_conn.execute(f"SET s3_secret_access_key='{minio_password}';")
    db_conn.execute(f"SET s3_use_ssl={use_ssl};")
    db_conn.execute("SET s3_url_style='path';")
    
    # Calculate top movers over the last 24 hours
    s3_glob_pattern = "s3://osrs-parquet/ticks/*/*/*/*.parquet"
    limit_time = int((datetime.now() - timedelta(hours=24)).timestamp())
    
    query = """
        WITH price_endpoints AS (
            SELECT 
                item_id,
                timestamp,
                COALESCE(avg_high_price, avg_low_price) as price,
                ROW_NUMBER() OVER(PARTITION BY item_id ORDER BY timestamp ASC) as rn_first,
                ROW_NUMBER() OVER(PARTITION BY item_id ORDER BY timestamp DESC) as rn_last
            FROM read_parquet(?, hive_partitioning=True)
            WHERE timestamp >= ? AND (avg_high_price IS NOT NULL OR avg_low_price IS NOT NULL)
        ),
        starting_prices AS (
            SELECT item_id, price as start_price FROM price_endpoints WHERE rn_first = 1
        ),
        ending_prices AS (
            SELECT item_id, price as end_price FROM price_endpoints WHERE rn_last = 1
        )
        SELECT 
            s.item_id,
            s.start_price,
            e.end_price,
            ((e.end_price - s.start_price)::DOUBLE / s.start_price) * 100 as percent_change
        FROM starting_prices s
        JOIN ending_prices e ON s.item_id = e.item_id
        WHERE s.start_price >= 100
        ORDER BY ABS(percent_change) DESC
        LIMIT 10;
    """
    
    try:
        logger.info("Computing top 10 price movers from DuckDB parquet files...")
        results = db_conn.execute(query, (s3_glob_pattern, limit_time)).fetchall()
        db_conn.close()
        
        if not results:
            logger.warning("No top movers computed from Parquet. Table update skipped.")
            return

        # 3. Connect to Postgres to fetch names and update daily_top_movers table
        logger.info("Connecting to Postgres to resolve names and update table...")
        pg_conn = psycopg2.connect(
            host=postgres_host,
            database=postgres_db,
            user=postgres_user,
            password=postgres_password
        )
        pg_cursor = pg_conn.cursor()
        
        # Resolve names
        item_ids = [r[0] for r in results]
        pg_cursor.execute("SELECT item_id, name FROM public.items_metadata WHERE item_id = ANY(%s)", (item_ids,))
        names_map = {r[0]: r[1] for r in pg_cursor.fetchall()}
        
        # Prepare records for insert
        records = []
        for r in results:
            item_id = r[0]
            start_price = int(r[1]) if r[1] is not None else None
            end_price = int(r[2]) if r[2] is not None else None
            percent_change = float(r[3]) if r[3] is not None else None
            name = names_map.get(item_id, f"Item #{item_id}")
            records.append((item_id, name, start_price, end_price, percent_change))
            
        # Update table atomically
        logger.info("Updating public.daily_top_movers table...")
        pg_cursor.execute("BEGIN;")
        pg_cursor.execute("TRUNCATE TABLE public.daily_top_movers;")
        insert_query = """
            INSERT INTO public.daily_top_movers (item_id, name, start_price, end_price, percent_change, last_updated)
            VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
        """
        pg_cursor.executemany(insert_query, records)
        pg_conn.commit()
        pg_cursor.close()
        pg_conn.close()
        logger.info("Successfully updated daily_top_movers table in Postgres.")
        
    except Exception as e:
        logger.error(f"Error in compute_daily_top_movers: {e}")
        raise e

with DAG(
    'osrs_daily_top_movers',
    default_args=default_args,
    description='Calculate daily Top 10 Price Movers at midnight',
    schedule_interval='0 0 * * *',  # Midnight daily
    catchup=False,
) as dag:

    compute_task = PythonOperator(
        task_id='compute_top_movers',
        python_callable=compute_daily_top_movers,
    )
