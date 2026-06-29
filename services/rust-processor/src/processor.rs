use crate::models::OsrsPriceTick;
use crate::cache::CacheManager;
use crate::config::Config;
use crate::repository::PostgresRepository;
use anyhow::Result;
use std::sync::Arc;
use redis::AsyncCommands;

pub struct Processor {
    postgres: PostgresRepository,
    cache: Arc<CacheManager>,
}

impl Processor {
    pub async fn new(config: &Config, cache: Arc<CacheManager>) -> Result<Self> {
        let postgres = PostgresRepository::new(config)?;
        
        Ok(Self {
            postgres,
            cache,
        })
    }

    pub async fn process_ticks(&self, ticks: Vec<OsrsPriceTick>) -> Result<()> {
        if ticks.is_empty() {
            return Ok(());
        }
        
        // Remove tokio::task::spawn_blocking here because iterating a small vector
        // and filtering it is very fast and doesn't warrant a blocking thread.
        let processed_ticks: Vec<OsrsPriceTick> = ticks
            .into_iter()
            .filter(|t| t.avg_high_price.unwrap_or(0) > 0 || t.avg_low_price.unwrap_or(0) > 0)
            .collect();

        if processed_ticks.is_empty() {
            return Ok(());
        }

        // Upsert to Postgres using the repository
        self.postgres.upsert_ticks(&processed_ticks).await?;

        // Write to Redis cache only if genuinely new price data
        let mut conn = self.cache.manager.clone();
        for tick in &processed_ticks {
            let key = format!("item:{}", tick.item_id);
            
            // Check existing value
            let existing_val: Option<String> = conn.get(&key).await.unwrap_or(None);
            let mut should_update = true;
            
            if let Some(val) = existing_val {
                if let Ok(existing_tick) = serde_json::from_str::<OsrsPriceTick>(&val) {
                    // Check if prices actually changed
                    if existing_tick.avg_high_price == tick.avg_high_price &&
                       existing_tick.avg_low_price == tick.avg_low_price {
                        should_update = false;
                    }
                }
            }

            if should_update {
                let val = serde_json::to_string(tick)?;
                let _: () = conn.set_ex(key, val, 300).await?; // 5 mins expiration
            }
        }

        log::info!("Successfully processed, postgres-synced, and cached {} priority ticks", processed_ticks.len());
        
        Ok(())
    }
}
