import os
import logging
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
    db_conn.execute(f"SET s3_endpoint='{MINIO_ENDPOINT}';")
    db_conn.execute(f"SET s3_access_key_id='{MINIO_USER}';")
    db_conn.execute(f"SET s3_secret_access_key='{MINIO_PASSWORD}';")
    db_conn.execute("SET s3_use_ssl=false;")
    db_conn.execute("SET s3_url_style='path';")
    logger.info("DuckDB configured with S3 HTTPFS extension successfully.")

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
    s3_glob_pattern = "s3://osrs-parquet/ticks/*/*/*/*.parquet"
    
    # Create thread-safe cursor
    cursor = db_conn.cursor()
    
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
    
    try:
        logger.info(f"Querying history for item {item_id} over the last {days} days...")
        cursor.execute(query, (s3_glob_pattern, item_id, epoch_limit))
        results = cursor.fetchall()
        
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
    except Exception as e:
        logger.error(f"Error querying DuckDB: {e}")
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")
    finally:
        cursor.close()

@app.get("/analytics/top-movers")
def get_top_movers(days: int = Query(24, description="Hours back to calculate top movers", ge=1, le=168)):
    """
    Calculate top price movements (percent increase/decrease) in the last N hours using historical Parquet data.
    """
    if not db_conn:
        raise HTTPException(status_code=500, detail="Database not initialized")
        
    s3_glob_pattern = "s3://osrs-parquet/ticks/*/*/*/*.parquet"
    cursor = db_conn.cursor()
    
    limit_time = int((datetime.now() - timedelta(hours=days)).timestamp())
    
    query = """
        WITH price_endpoints AS (
            -- Get first and last tick per item in the window
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
        WHERE s.start_price > 0
        ORDER BY ABS(percent_change) DESC
        LIMIT 50;
    """
    
    try:
        logger.info(f"Computing top movers over the last {days} hours...")
        cursor.execute(query, (s3_glob_pattern, limit_time))
        results = cursor.fetchall()
        
        movers = []
        for r in results:
            movers.append({
                "item_id": r[0],
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
        logger.error(f"Error computing top movers: {e}")
        raise HTTPException(status_code=500, detail=f"Database query error: {str(e)}")
    finally:
        cursor.close()
