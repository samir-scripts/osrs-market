

SELECT
    item_id,
    timestamp,
    avg_high_price,
    avg_low_price,
    ifNull(high_price_volume, 0) + ifNull(low_price_volume, 0) as total_volume
FROM `default`.`clean_osrs_prices`

WHERE timestamp >= (SELECT max(timestamp) FROM `default`.`gold_osrs_prices`)
