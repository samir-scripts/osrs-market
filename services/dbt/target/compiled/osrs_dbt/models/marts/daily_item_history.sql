

SELECT
    item_id,
    epoch(date_trunc('day', to_timestamp(timestamp)))::BIGINT as timestamp,
    ROUND(AVG(avg_high_price), 2) as avg_high_price,
    ROUND(AVG(avg_low_price), 2) as avg_low_price,
    ROUND(AVG(high_price_volume), 2) as high_price_volume,
    ROUND(AVG(low_price_volume), 2) as low_price_volume
FROM read_parquet('s3://osrs-parquet/ticks/*/*/*/*.parquet', hive_partitioning=True)
GROUP BY item_id, date_trunc('day', to_timestamp(timestamp))