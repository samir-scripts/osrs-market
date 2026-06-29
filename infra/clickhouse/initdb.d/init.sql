CREATE DATABASE IF NOT EXISTS osrs;

-- 1. Kafka Engine Table (The Consumer)
CREATE TABLE IF NOT EXISTS osrs.kafka_price_ticks (
    item_id Int32,
    timestamp Int64,
    avg_high_price Nullable(Int64),
    high_price_volume Nullable(Int64),
    avg_low_price Nullable(Int64),
    low_price_volume Nullable(Int64)
) ENGINE = Kafka
SETTINGS kafka_broker_list = 'redpanda:29092',
         kafka_topic_list = 'osrs.price-ticks.raw',
         kafka_group_name = 'clickhouse_raw_ingestion',
         kafka_format = 'AvroConfluent',
         format_avro_schema_registry_url = 'http://redpanda:8081';

-- 2. Bronze Table (Raw Data)
CREATE TABLE IF NOT EXISTS osrs.raw_osrs_prices (
    item_id Int32,
    timestamp Int64,
    avg_high_price Nullable(Int64),
    high_price_volume Nullable(Int64),
    avg_low_price Nullable(Int64),
    low_price_volume Nullable(Int64),
    ingested_at DateTime DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(timestamp))
ORDER BY (item_id, timestamp);

-- 3. Materialized View to move data from Kafka -> Bronze
CREATE MATERIALIZED VIEW IF NOT EXISTS osrs.mv_kafka_to_raw
TO osrs.raw_osrs_prices AS
SELECT
    item_id,
    timestamp,
    avg_high_price,
    high_price_volume,
    avg_low_price,
    low_price_volume
FROM osrs.kafka_price_ticks;

-- 4. Silver Table (Clean Data)
CREATE TABLE IF NOT EXISTS osrs.clean_osrs_prices (
    item_id Int32,
    timestamp Int64,
    datetime DateTime CODEC(DoubleDelta, LZ4),
    avg_high_price Int64,
    high_price_volume Int64,
    avg_low_price Int64,
    low_price_volume Int64
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(datetime)
ORDER BY (item_id, datetime);

-- 5. Materialized View to move data from Bronze -> Silver
CREATE MATERIALIZED VIEW IF NOT EXISTS osrs.mv_raw_to_clean
TO osrs.clean_osrs_prices AS
SELECT
    item_id,
    timestamp,
    toDateTime(timestamp) as datetime,
    coalesce(avg_high_price, 0) as avg_high_price,
    coalesce(high_price_volume, 0) as high_price_volume,
    coalesce(avg_low_price, 0) as avg_low_price,
    coalesce(low_price_volume, 0) as low_price_volume
FROM osrs.raw_osrs_prices
WHERE avg_high_price IS NOT NULL OR avg_low_price IS NOT NULL;

-- 6. Gold Table (Daily aggregates)
CREATE TABLE IF NOT EXISTS osrs.gold_osrs_prices_daily (
    item_id Int32,
    date Date,
    avg_high_price AggregateFunction(avg, Int64),
    avg_low_price AggregateFunction(avg, Int64),
    total_volume AggregateFunction(sum, Int64)
) ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(date)
ORDER BY (item_id, date);

-- 7. Materialized View to move data from Silver -> Gold
CREATE MATERIALIZED VIEW IF NOT EXISTS osrs.mv_clean_to_gold_daily
TO osrs.gold_osrs_prices_daily AS
SELECT
    item_id,
    toDate(datetime) AS date,
    avgState(avg_high_price) AS avg_high_price,
    avgState(avg_low_price) AS avg_low_price,
    sumState(high_price_volume + low_price_volume) AS total_volume
FROM osrs.clean_osrs_prices
GROUP BY item_id, date;
