import os
import logging
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
import duckdb
from minio import Minio

logger = logging.getLogger(__name__)

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

def compact_parquet_partition(**kwargs):
    # Determine the target date to compact (yesterday by default)
    execution_date = kwargs.get('execution_date')
    if not execution_date:
        execution_date = datetime.now() - timedelta(days=1)
    
    year_str = execution_date.strftime('%Y')
    month_str = execution_date.strftime('%m')
    day_str = execution_date.strftime('%d')
    
    partition_path = f"year={year_str}/month={month_str}/day={day_str}"
    logger.info(f"Starting compaction for partition: {partition_path}")
    
    minio_endpoint = os.getenv("MINIO_ENDPOINT", "minio:9000")
    minio_user = os.getenv("MINIO_ROOT_USER", "minioadmin")
    minio_password = os.getenv("MINIO_ROOT_PASSWORD", "minioadmin_secure_pass")
    
    # Initialize DuckDB connection
    conn = duckdb.connect()
    
    # Install and load HTTPFS extension for S3 support
    conn.execute("INSTALL httpfs;")
    conn.execute("LOAD httpfs;")
    
    # Configure S3 options for MinIO
    conn.execute(f"SET s3_endpoint='{minio_endpoint}';")
    conn.execute(f"SET s3_access_key_id='{minio_user}';")
    conn.execute(f"SET s3_secret_access_key='{minio_password}';")
    conn.execute("SET s3_use_ssl=false;")
    conn.execute("SET s3_url_style='path';")
    
    # Source path containing multiple small files
    source_s3_path = f"s3://osrs-parquet/ticks/{partition_path}/*.parquet"
    # Temp destination for compacted file
    temp_dest_s3_path = f"s3://osrs-parquet/compacted/{partition_path}/data.parquet"
    
    logger.info(f"Compacting from {source_s3_path} to {temp_dest_s3_path}")
    
    try:
        # Check if there are files to compact
        # We can try to count rows. If it fails or returns 0, skip.
        row_count = conn.execute(f"SELECT COUNT(*) FROM read_parquet('{source_s3_path}')").fetchone()[0]
        logger.info(f"Found {row_count} records to compact in partition.")
        
        if row_count == 0:
            logger.info("No records found. Skipping compaction.")
            return
            
        # Copy records to temporary compacted file
        copy_sql = f"COPY (SELECT * FROM read_parquet('{source_s3_path}')) TO '{temp_dest_s3_path}' (FORMAT PARQUET);"
        conn.execute(copy_sql)
        logger.info("Compacted data written to temp location.")
        
        # Now clean up small files and promote compacted file using Minio Python SDK
        # Connect to MinIO
        mc = Minio(minio_endpoint, access_key=minio_user, secret_key=minio_password, secure=False)
        
        bucket_name = "osrs-parquet"
        
        # 1. Delete original small files under ticks/year=YYYY/month=MM/day=DD/
        prefix_to_delete = f"ticks/{partition_path}/"
        objects_to_delete = mc.list_objects(bucket_name, prefix=prefix_to_delete, recursive=True)
        
        for obj in objects_to_delete:
            mc.remove_object(bucket_name, obj.object_name)
            logger.info(f"Deleted small file: {obj.object_name}")
            
        # 2. Copy the compacted file from compacted/ to ticks/
        source_compacted_key = f"compacted/{partition_path}/data.parquet"
        dest_compacted_key = f"ticks/{partition_path}/data.parquet"
        
        from minio.common import CopySource
        mc.copy_object(
            bucket_name,
            dest_compacted_key,
            CopySource(bucket_name, source_compacted_key)
        )
        logger.info(f"Promoted compacted file to: {dest_compacted_key}")
        
        # 3. Clean up the temp compacted file
        mc.remove_object(bucket_name, source_compacted_key)
        logger.info("Temp compacted file cleaned up.")
        
    except Exception as e:
        logger.error(f"Error during partition compaction: {e}")
        raise
    finally:
        conn.close()

with DAG(
    'osrs_parquet_compaction',
    default_args=default_args,
    description='Compact daily small Parquet files in MinIO into large blocks',
    schedule_interval='0 2 * * *', # Daily at 2:00 AM
    catchup=False,
) as dag:

    compact_task = PythonOperator(
        task_id='compact_partition',
        python_callable=compact_parquet_partition,
    )
