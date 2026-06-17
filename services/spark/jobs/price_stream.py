import os
import sys
import json
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, expr, from_json, to_timestamp, year, month, day, window, avg, stddev, last, current_timestamp
from pyspark.sql.avro.functions import from_avro
from pyspark.sql.types import StructType, StructField, IntegerType, LongType, StringType

# Set python path or options if needed
os.environ['PYSPARK_SUBMIT_ARGS'] = '--packages org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0,org.apache.spark:spark-avro_2.12:3.5.0,org.postgresql:postgresql:42.6.0,org.apache.hadoop:hadoop-aws:3.3.4,com.amazonaws:aws-java-sdk-bundle:1.12.262 pyspark-shell'

def get_config():
    """Retrieve all necessary configuration from environment variables."""
    return {
        "brokers": os.getenv("REDPANDA_BROKERS", "redpanda:29092"),
        "postgres": {
            "host": os.getenv("POSTGRES_HOST", "postgres"),
            "db": os.getenv("POSTGRES_DB", "osrs_market"),
            "user": os.getenv("POSTGRES_USER", "postgres"),
            "password": os.getenv("POSTGRES_PASSWORD", "postgres_secure_pass")
        },
        "minio": {
            "endpoint": os.getenv("MINIO_ENDPOINT", "http://minio:9000"),
            "access_key": os.getenv("MINIO_ROOT_USER", "minioadmin"),
            "secret_key": os.getenv("MINIO_ROOT_PASSWORD", "minioadmin_secure_pass")
        }
    }

def get_spark_session(config) -> SparkSession:
    """Initialize and return a Spark Session configured with S3A (MinIO) and JDBC (Postgres)."""
    spark = SparkSession.builder \
        .appName("OSRS-Price-Streaming-Engine") \
        .config("spark.hadoop.fs.s3a.endpoint", config["minio"]["endpoint"]) \
        .config("spark.hadoop.fs.s3a.access.key", config["minio"]["access_key"]) \
        .config("spark.hadoop.fs.s3a.secret.key", config["minio"]["secret_key"]) \
        .config("spark.hadoop.fs.s3a.path.style.access", "true") \
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem") \
        .config("spark.sql.streaming.checkpointLocation", "/opt/spark/checkpoints/price-stream") \
        .getOrCreate()
        
    spark.sparkContext.setLogLevel("WARN")
    logger = spark._jvm.org.apache.log4j.LogManager.getLogger("OSRS-Price-Streaming-Engine")
    logger.info("Spark Session initialized successfully.")
    
    return spark

def get_avro_schema() -> str:
    """Load Avro Schema definition."""
    schema_path = "/opt/spark/jobs/price_tick.avsc"
    if not os.path.exists(schema_path):
        # Fallback schema string if file not found inside container path
        return """{
          "type": "record",
          "name": "PriceTick",
          "namespace": "osrs.market",
          "fields": [
            {"name": "item_id", "type": "int"},
            {"name": "timestamp", "type": "long"},
            {"name": "avg_high_price", "type": ["null", "long"], "default": null},
            {"name": "high_price_volume", "type": ["null", "long"], "default": null},
            {"name": "avg_low_price", "type": ["null", "long"], "default": null},
            {"name": "low_price_volume", "type": ["null", "long"], "default": null}
          ]
        }"""
    else:
        with open(schema_path, "r") as f:
            return f.read()

def _upsert_to_postgres(postgres_payload, batch_id, spark: SparkSession, pg_config: dict):
    """Helper to write to temporary staging table and run upsert query."""
    jdbc_url = f"jdbc:postgresql://{pg_config['host']}:5432/{pg_config['db']}"
    connection_properties = {
        "user": pg_config['user'],
        "password": pg_config['password'],
        "driver": "org.postgresql.Driver"
    }
    
    staging_table = f"staging_prices_batch_{batch_id}"
    
    try:
        # Save to staging table
        postgres_payload.write.jdbc(
            url=jdbc_url,
            table=staging_table,
            mode="overwrite",
            properties=connection_properties
        )
        
        conn = spark._jvm.java.sql.DriverManager.getConnection(jdbc_url, pg_config['user'], pg_config['password'])
        stmt = conn.createStatement()
        
        upsert_sql = f"""
            INSERT INTO public.latest_item_prices (
                item_id, avg_high_price, avg_low_price, high_price_volume, low_price_volume, last_updated
            )
            SELECT item_id, avg_high_price, avg_low_price, high_price_volume, low_price_volume, last_updated
            FROM {staging_table}
            ON CONFLICT (item_id) DO UPDATE SET
                avg_high_price = EXCLUDED.avg_high_price,
                avg_low_price = EXCLUDED.avg_low_price,
                high_price_volume = EXCLUDED.high_price_volume,
                low_price_volume = EXCLUDED.low_price_volume,
                last_updated = EXCLUDED.last_updated;
        """
        stmt.execute(upsert_sql)
        stmt.execute(f"DROP TABLE IF EXISTS {staging_table}")
        stmt.close()
        conn.close()
    except Exception as e:
        sys.stderr.write(f"Error upserting to Postgres in batch {batch_id}: {e}\n")

def process_batch(batch_df, batch_id, spark: SparkSession, config: dict):
    """Process a micro-batch of streaming data."""
    if batch_df.isEmpty():
        return
        
    # Cache for multi-sink write
    batch_df.cache()

    # Sink 1: Analytical Store (MinIO Parquet)
    batch_df.write \
        .format("parquet") \
        .mode("append") \
        .partitionBy("year", "month", "day") \
        .save("s3a://osrs-parquet/ticks/")

    # Sink 2: Operational Store (Postgres latest price upsert)
    from pyspark.sql.window import Window
    from pyspark.sql.functions import row_number
    
    # Find the latest record for each item_id in this micro-batch
    window_spec = Window.partitionBy("item_id").orderBy(col("timestamp").desc())
    latest_batch_df = batch_df \
        .withColumn("rn", row_number().over(window_spec)) \
        .filter(col("rn") == 1) \
        .drop("rn")

    postgres_payload = latest_batch_df.select(
        col("item_id"),
        col("avg_high_price"),
        col("avg_low_price"),
        col("high_price_volume"),
        col("low_price_volume"),
        col("timestamp_ts").alias("last_updated")
    )

    _upsert_to_postgres(postgres_payload, batch_id, spark, config["postgres"])
    
    batch_df.unpersist()

def main():
    config = get_config()
    spark = get_spark_session(config)
    avro_schema_str = get_avro_schema()

    # Read stream from Redpanda
    kafka_df = spark.readStream \
        .format("kafka") \
        .option("kafka.bootstrap.servers", config["brokers"]) \
        .option("subscribe", "osrs.price-ticks.raw") \
        .option("startingOffsets", "latest") \
        .load()

    # Strip 5-byte Confluent Schema Registry header and deserialize Avro
    parsed_df = kafka_df \
        .withColumn("avro_bytes", expr("substring(value, 6, length(value) - 5)")) \
        .withColumn("data", from_avro(col("avro_bytes"), avro_schema_str)) \
        .select("data.*")

    # Filter out anomalous data
    clean_df = parsed_df \
        .filter((col("item_id").isNotNull()) & (col("timestamp") > 0)) \
        .withColumn("timestamp_ts", to_timestamp(col("timestamp"))) \
        .withColumn("year", year(col("timestamp_ts"))) \
        .withColumn("month", month(col("timestamp_ts"))) \
        .withColumn("day", day(col("timestamp_ts")))

    # Start the streaming query
    query = clean_df.writeStream \
        .foreachBatch(lambda batch_df, batch_id: process_batch(batch_df, batch_id, spark, config)) \
        .start()

    query.awaitTermination()

if __name__ == "__main__":
    main()
