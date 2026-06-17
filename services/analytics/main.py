import os
import logging
import time
import psycopg2
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Query
from prometheus_fastapi_instrumentator import Instrumentator
import duckdb

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="OSRS Market Analytical API", version="1.0")

# Instrument Prometheus metrics
Instrumentator().instrument(app).expose(app)

# Environment variables
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_USER = os.getenv("MINIO_ROOT_USER", "minioadmin")
MINIO_PASSWORD = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin_secure_pass")

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "osrs-postgres")
POSTGRES_DB = os.getenv("POSTGRES_DB", "osrs_market")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres_secure_pass")

# Global DuckDB connection
db_conn = None

def init_duckdb():
    global db_conn
    logger.info("Initializing global DuckDB database connection...")
    # In-memory database, we will query S3/Parquet directly
    db_conn = duckdb.connect()
    
    # Configure S3 extension
    db_conn.execute("INSTALL httpfs;")
    db_conn.execute("LOAD httpfs;")
    
    # Strip protocol scheme if present (DuckDB's s3_endpoint expects hostname[:port] only)
    endpoint = MINIO_ENDPOINT
    use_ssl = "false"
    if endpoint.startswith("http://"):
        endpoint = endpoint[7:]
    elif endpoint.startswith("https://"):
        endpoint = endpoint[8:]
        use_ssl = "true"
        
    db_conn.execute(f"SET s3_endpoint='{endpoint}';")
    db_conn.execute(f"SET s3_access_key_id='{MINIO_USER}';")
    db_conn.execute(f"SET s3_secret_access_key='{MINIO_PASSWORD}';")
    db_conn.execute(f"SET s3_use_ssl={use_ssl};")
    db_conn.execute("SET s3_url_style='path';")
    logger.info(f"DuckDB configured with S3 HTTPFS extension to {endpoint} (ssl={use_ssl}) successfully.")


@app.on_event("startup")
def startup_event():
    init_duckdb()

@app.on_event("shutdown")
def shutdown_event():
    global db_conn
    if db_conn:
        logger.info("Closing DuckDB connection...")
        db_conn.close()

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "duckdb_initialized": db_conn is not None
    }

@app.get("/items/{item_id}/history")
def get_item_history(item_id: int, days: int = Query(7, ge=1, le=90)):
    if not db_conn:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    # Calculate partition filter to speed up queries
    start_date = datetime.now() - timedelta(days=days)
    
    # Construct a list of partition filters for the dates we want (to prune files)
    # DuckDB will prune based on the glob or hive structure.
    # To be safe and fast, we can use hive partitioning features or direct glob filter.
    if days >= 7:
        s3_glob_pattern = "s3://osrs-parquet/marts/daily/daily_item_history.parquet"
        query = """
            SELECT 
                timestamp,
                avg_high_price,
                avg_low_price,
                high_price_volume,
                low_price_volume
            FROM read_parquet(?)
            WHERE item_id = ? 
              AND timestamp >= ?
            ORDER BY timestamp ASC;
        """
    else:
        s3_glob_pattern = "s3://osrs-parquet/ticks/*/*/*/*.parquet"
        query = """
            SELECT 
                timestamp,
                avg_high_price,
                avg_low_price,
                high_price_volume,
                low_price_volume
            FROM read_parquet(?, hive_partitioning=True)
            WHERE item_id = ? 
              AND timestamp >= ?
            ORDER BY timestamp ASC;
        """
    
    epoch_limit = int(start_date.timestamp())
    
    # Verify if the item exists in Postgres metadata (if not, return 404 or empty list immediately)
    is_valid_item = False
    try:
        conn = psycopg2.connect(
            host=POSTGRES_HOST,
            database=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD
        )
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM public.items_metadata WHERE item_id = %s", (item_id,))
        is_valid_item = cur.fetchone() is not None
        cur.close()
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to verify item existence in Postgres: {e}")
        # Fallback to True to avoid false negatives if Postgres connection fails
        is_valid_item = True

    if not is_valid_item:
        raise HTTPException(status_code=404, detail=f"Item with ID {item_id} not found in metadata")

    max_retries = 5
    retry_delay = 1.0  # seconds
    
    for attempt in range(max_retries):
        try:
            logger.info(f"Querying history for item {item_id} (attempt {attempt + 1}/{max_retries})...")
            results = db_conn.execute(query, (s3_glob_pattern, item_id, epoch_limit)).fetchall()
            
            if len(results) > 0:
                history = []
                for r in results:
                    history.append({
                        "timestamp": r[0],
                        "avg_high_price": r[1],
                        "avg_low_price": r[2],
                        "high_price_volume": r[3],
                        "low_price_volume": r[4]
                    })
                return {
                    "item_id": item_id,
                    "days": days,
                    "count": len(history),
                    "data": history
                }
            else:
                logger.warning(f"No history found for item {item_id} (attempt {attempt + 1}/{max_retries}). Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
        except Exception as e:
            logger.warning(f"Error querying DuckDB (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {retry_delay}s...")
            time.sleep(retry_delay)
            
    # If all retries failed and returned 0 rows, return empty structure instead of crashing
    return {
        "item_id": item_id,
        "days": days,
        "count": 0,
        "data": []
    }

@app.get("/analytics/top-movers")
def get_top_movers(
    days: int = Query(24, description="Hours back to calculate top movers", ge=1, le=168),
    limit: int = Query(10, description="Limit count of top movers", ge=1, le=100)
):
    """
    Get top price movements (percent increase/decrease). Tries to read pre-computed daily top movers from Postgres.
    Falls back to computing dynamically via DuckDB if not available.
    """
    # 1. Try reading from Postgres daily_top_movers
    try:
        conn = psycopg2.connect(
            host=POSTGRES_HOST,
            database=POSTGRES_DB,
            user=POSTGRES_USER,
            password=POSTGRES_PASSWORD
        )
        cur = conn.cursor()
        cur.execute(
            "SELECT item_id, name, start_price, end_price, percent_change FROM public.daily_top_movers ORDER BY ABS(percent_change) DESC LIMIT %s",
            (limit,)
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        if rows:
            movers = []
            for r in rows:
                movers.append({
                    "item_id": r[0],
                    "name": r[1],
                    "start_price": r[2],
                    "end_price": r[3],
                    "percent_change": round(r[4], 2)
                })
            logger.info("Successfully fetched top movers from Postgres daily_top_movers table.")
            return {
                "hours": 24,
                "count": len(movers),
                "movers": movers
            }
    except Exception as e:
        logger.warning(f"Failed to query daily_top_movers from Postgres: {e}. Falling back to dynamic calculation.")

    # 2. Fallback to dynamic computation via DuckDB if Postgres data is not available
    if not db_conn:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    s3_glob_pattern = "s3://osrs-parquet/ticks/*/*/*/*.parquet"
    limit_time = int((datetime.now() - timedelta(hours=days)).timestamp())
    
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
        LIMIT ?;
    """
    
    try:
        logger.info(f"Computing top movers over the last {days} hours dynamically (limit={limit})...")
        results = db_conn.execute(query, (s3_glob_pattern, limit_time, limit)).fetchall()
        
        # Resolve names from Postgres
        item_ids = [r[0] for r in results]
        names_map = {}
        if item_ids:
            try:
                conn = psycopg2.connect(
                    host=POSTGRES_HOST,
                    database=POSTGRES_DB,
                    user=POSTGRES_USER,
                    password=POSTGRES_PASSWORD
                )
                cur = conn.cursor()
                cur.execute("SELECT item_id, name FROM public.items_metadata WHERE item_id = ANY(%s)", (item_ids,))
                names_map = {r[0]: r[1] for r in cur.fetchall()}
                cur.close()
                conn.close()
            except Exception as name_err:
                logger.warning(f"Failed to fetch item names: {name_err}")
        
        movers = []
        for r in results:
            item_id = r[0]
            movers.append({
                "item_id": item_id,
                "name": names_map.get(item_id, f"Item #{item_id}"),
                "start_price": r[1],
                "end_price": r[2],
                "percent_change": round(r[3], 2)
            })
            
        return {
            "hours": days,
            "count": len(movers),
            "movers": movers
        }
    except Exception as e:
        logger.error(f"Error computing top movers dynamically: {e}")
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")


