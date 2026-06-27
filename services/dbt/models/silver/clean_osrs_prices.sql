{{ config(
    materialized='incremental',
    unique_key=['item_id', 'timestamp']
) }}

WITH extracted AS (
    SELECT
        toDateTime(toUInt32(JSONExtractString(raw_data, 'timestamp'))) as timestamp,
        JSONExtractKeysAndValuesRaw(raw_data, 'data') as items
    FROM default.raw_osrs_prices
    {% if is_incremental() %}
    WHERE ingested_at > (SELECT max(ingested_at) FROM {{ this }})
    {% endif %}
),
flattened AS (
    SELECT
        timestamp,
        tupleElement(item, 1) as item_id_str,
        tupleElement(item, 2) as item_data_raw
    FROM extracted
    ARRAY JOIN items AS item
)
SELECT
    toUInt32(item_id_str) as item_id,
    timestamp,
    toUInt32OrNull(JSONExtractString(item_data_raw, 'avgHighPrice')) as avg_high_price,
    toUInt32OrNull(JSONExtractString(item_data_raw, 'avgLowPrice')) as avg_low_price,
    toUInt32OrNull(JSONExtractString(item_data_raw, 'highPriceVolume')) as high_price_volume,
    toUInt32OrNull(JSONExtractString(item_data_raw, 'lowPriceVolume')) as low_price_volume,
    now() as ingested_at
FROM flattened
