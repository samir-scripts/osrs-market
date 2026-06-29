use crate::models::OsrsPriceTick;
use crate::config::Config;
use anyhow::Result;
use deadpool_postgres::{Pool, Manager, ManagerConfig, RecyclingMethod};
use tokio_postgres::NoTls;

pub struct PostgresRepository {
    pub pool: Pool,
}

impl PostgresRepository {
    pub fn new(config: &Config) -> Result<Self> {
        let mgr_config = ManagerConfig {
            recycling_method: RecyclingMethod::Fast
        };
        let connection_string = format!(
            "host={} user={} password={} dbname={}",
            config.postgres_host, config.postgres_user, config.postgres_password, config.postgres_db
        );
        let mgr = Manager::from_config(connection_string.parse()?, NoTls, mgr_config);
        let pool = Pool::builder(mgr).max_size(16).build()?;
        
        Ok(Self { pool })
    }

    pub async fn upsert_ticks(&self, ticks: &[OsrsPriceTick]) -> Result<()> {
        if ticks.is_empty() {
            return Ok(());
        }

        let client = self.pool.get().await?;
        let stmt = client.prepare("
            INSERT INTO latest_item_prices (
                item_id, avg_high_price, avg_low_price, high_price_volume, low_price_volume, last_updated
            ) VALUES ($1, $2, $3, $4, $5, to_timestamp($6))
            ON CONFLICT (item_id) DO UPDATE SET
                previous_avg_high_price = latest_item_prices.avg_high_price,
                previous_avg_low_price = latest_item_prices.avg_low_price,
                avg_high_price = EXCLUDED.avg_high_price,
                avg_low_price = EXCLUDED.avg_low_price,
                high_price_volume = EXCLUDED.high_price_volume,
                low_price_volume = EXCLUDED.low_price_volume,
                last_updated = EXCLUDED.last_updated
        ").await?;

        for tick in ticks {
            let timestamp_f64 = tick.timestamp as f64;
            if let Err(e) = client.execute(&stmt, &[
                &tick.item_id, 
                &tick.avg_high_price, 
                &tick.avg_low_price, 
                &tick.high_price_volume, 
                &tick.low_price_volume, 
                &timestamp_f64
            ]).await {
                log::error!("Failed to upsert to Postgres for item {}: {}", tick.item_id, e);
            }
        }
        
        Ok(())
    }
}

pub struct ClickhouseRepository {
    client: reqwest::Client,
    url: String,
    user: String,
    pass: String,
}

impl ClickhouseRepository {
    pub fn new(config: &Config) -> Self {
        Self {
            client: reqwest::Client::new(),
            url: config.clickhouse_url.clone(),
            user: config.clickhouse_user.clone(),
            pass: config.clickhouse_password.clone(),
        }
    }

    pub async fn get_item_history(&self, item_id: i64, days: i64) -> Result<serde_json::Value> {
        let interval = if days <= 1 {
            "5 MINUTE"
        } else if days <= 7 {
            "1 HOUR"
        } else {
            "4 HOUR"
        };

        let ch_query = format!(
            "SELECT 
                toUnixTimestamp(toStartOfInterval(toDateTime(timestamp), INTERVAL {})) as ts,
                toUInt64(avg(avg_high_price)) as avgHighPrice,
                toUInt64(sum(high_price_volume)) as highPriceVolume,
                toUInt64(avg(avg_low_price)) as avgLowPrice,
                toUInt64(sum(low_price_volume)) as lowPriceVolume
             FROM osrs.clean_osrs_prices
             WHERE item_id = {} 
               AND timestamp >= toUnixTimestamp(now() - INTERVAL {} DAY)
             GROUP BY ts
             ORDER BY ts ASC
             FORMAT JSON",
            interval, item_id, days
        );

        let resp = self.client.post(&self.url)
            .basic_auth(&self.user, Some(&self.pass))
            .body(ch_query)
            .send()
            .await?;
            
        let json = resp.json::<serde_json::Value>().await?;
        Ok(json)
    }

    pub async fn get_top_movers(&self) -> Result<serde_json::Value> {
        let ch_query = r#"
            WITH latest AS (
                SELECT item_id, avg_high_price, avg_low_price
                FROM osrs.clean_osrs_prices
                WHERE timestamp >= toUnixTimestamp(now() - INTERVAL 1 DAY)
                ORDER BY timestamp DESC
                LIMIT 1 BY item_id
            ),
            previous AS (
                SELECT item_id, avg_high_price, avg_low_price
                FROM osrs.clean_osrs_prices
                WHERE timestamp >= toUnixTimestamp(now() - INTERVAL 2 DAY)
                  AND timestamp < toUnixTimestamp(now() - INTERVAL 1 DAY)
                ORDER BY timestamp DESC
                LIMIT 1 BY item_id
            )
            SELECT 
                l.item_id,
                l.avg_high_price,
                p.avg_high_price as prev_avg_high_price,
                (l.avg_high_price - p.avg_high_price) / p.avg_high_price * 100 AS price_change_percent
            FROM latest l
            JOIN previous p ON l.item_id = p.item_id
            WHERE p.avg_high_price > 0
            ORDER BY abs(price_change_percent) DESC
            LIMIT 10
            FORMAT JSON
        "#;
        
        let resp = self.client.post(&self.url)
            .basic_auth(&self.user, Some(&self.pass))
            .body(ch_query.to_string())
            .send()
            .await?;
            
        let json = resp.json::<serde_json::Value>().await?;
        Ok(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_postgres_repo_creation() {
        let config = Config {
            redpanda_brokers: "".into(),
            schema_registry_url: "".into(),
            minio_endpoint: "".into(),
            minio_root_user: "".into(),
            minio_root_password: "".into(),
            redis_url: "".into(),
            postgres_host: "localhost".into(),
            postgres_db: "osrs".into(),
            postgres_user: "user".into(),
            postgres_password: "password".into(),
            worker_count: 1,
            batch_size: 1,
            max_upload_concurrency: 1,
            priority_price_threshold: 1,
            priority_volume_threshold: 1,
            clickhouse_url: "".into(),
            clickhouse_user: "".into(),
            clickhouse_password: "".into(),
        };
        let repo = PostgresRepository::new(&config);
        assert!(repo.is_ok());
    }

    #[test]
    fn test_clickhouse_repo_creation() {
        let config = Config {
            redpanda_brokers: "".into(),
            schema_registry_url: "".into(),
            minio_endpoint: "".into(),
            minio_root_user: "".into(),
            minio_root_password: "".into(),
            redis_url: "".into(),
            postgres_host: "".into(),
            postgres_db: "".into(),
            postgres_user: "".into(),
            postgres_password: "".into(),
            worker_count: 1,
            batch_size: 1,
            max_upload_concurrency: 1,
            priority_price_threshold: 1,
            priority_volume_threshold: 1,
            clickhouse_url: "http://localhost:8123".into(),
            clickhouse_user: "default".into(),
            clickhouse_password: "password".into(),
        };
        let repo = ClickhouseRepository::new(&config);
        assert_eq!(repo.url, "http://localhost:8123");
        assert_eq!(repo.user, "default");
        assert_eq!(repo.pass, "password");
    }
}
