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

        // In a real scenario we'd batch upsert to postgres using self.db_pool
        // let client = self.db_pool.get().await?;

        // Write to Redis cache
        let mut conn = cache.manager.clone();
        for tick in &processed_ticks {
            let key = format!("item:{}", tick.item_id);
            let val = serde_json::to_string(tick)?;
            let _: () = conn.set_ex(key, val, 300).await?; // 5 mins expiration
        }

        log::info!("Successfully processed and cached {} priority ticks", processed_ticks.len());
        
        Ok(())
    }
}
