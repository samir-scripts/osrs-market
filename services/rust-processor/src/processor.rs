use crate::models::OsrsPriceTick;
use crate::cache::CacheManager;
use crate::config::Config;
use anyhow::Result;
use deadpool_postgres::{Pool, Manager, ManagerConfig, RecyclingMethod};
use tokio_postgres::NoTls;
use std::sync::Arc;
use redis::AsyncCommands;

pub struct Processor {
    db_pool: Pool,
    cache: Arc<CacheManager>,
}

impl Processor {
    pub async fn new(config: &Config, cache: Arc<CacheManager>) -> Result<Self> {
        let mgr_config = ManagerConfig {
            recycling_method: RecyclingMethod::Fast
        };
        let connection_string = format!(
            "host={} user={} password={} dbname={}",
            config.postgres_host, config.postgres_user, config.postgres_password, config.postgres_db
        );
        let mgr = Manager::from_config(connection_string.parse()?, NoTls, mgr_config);
        let pool = Pool::builder(mgr).max_size(16).build()?;
        
        Ok(Self {
            db_pool: pool,
            cache,
        })
    }

    pub async fn process_ticks(&self, ticks: Vec<OsrsPriceTick>) -> Result<()> {
        if ticks.is_empty() {
            return Ok(());
        }
        
        let cache = self.cache.clone();

        // Process in Rayon
        let processed_ticks: Vec<OsrsPriceTick> = tokio::task::spawn_blocking(move || {
            ticks.into_iter().filter(|t| t.avg_high_price.unwrap_or(0) > 0 || t.avg_low_price.unwrap_or(0) > 0).collect()
        }).await?;

        let client = self.db_pool.get().await?;
        
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

        // Write to Redis cache and Postgres
        let mut conn = cache.manager.clone();
        for tick in &processed_ticks {
            // Postgres upsert
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

            // Redis set
            let key = format!("item:{}", tick.item_id);
            let val = serde_json::to_string(tick)?;
            let _: () = conn.set_ex(key, val, 300).await?; // 5 mins expiration
        }

        log::info!("Successfully processed, postgres-synced, and cached {} priority ticks", processed_ticks.len());
        
        Ok(())
    }
}
