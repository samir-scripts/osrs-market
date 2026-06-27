{{ config(
    materialized='incremental',
    unique_key=['item_id', 'timestamp']
) }}

SELECT
    item_id,
    timestamp,
    avg_high_price,
    avg_low_price,
    ifNull(high_price_volume, 0) + ifNull(low_price_volume, 0) as total_volume
FROM {{ ref('clean_osrs_prices') }}
{% if is_incremental() %}
WHERE timestamp >= (SELECT max(timestamp) FROM {{ this }})
{% endif %}
