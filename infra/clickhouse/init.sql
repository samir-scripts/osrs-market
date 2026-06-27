CREATE DATABASE IF NOT EXISTS default;

-- Bronze Layer: Raw JSON strings directly from the API
CREATE TABLE IF NOT EXISTS default.raw_osrs_prices (
    raw_data String,
    ingested_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY ingested_at;

-- Silver Layer: Cleaned, columnar data
CREATE TABLE IF NOT EXISTS default.clean_osrs_prices (
    item_id UInt32,
    timestamp DateTime,
    avg_high_price Nullable(UInt32),
    avg_low_price Nullable(UInt32),
    high_price_volume Nullable(UInt32),
    low_price_volume Nullable(UInt32),
    ingested_at DateTime DEFAULT now()
) ENGINE = MergeTree()
ORDER BY (item_id, timestamp);

-- Gold Layer: Aggregated 5-minute rolling data (if using standard tables)
CREATE TABLE IF NOT EXISTS default.gold_osrs_prices (
    item_id UInt32,
    timestamp DateTime,
    avg_high_price Nullable(UInt32),
    avg_low_price Nullable(UInt32),
    total_volume Nullable(UInt32)
) ENGINE = MergeTree()
ORDER BY (item_id, timestamp);
