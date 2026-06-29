use redis::aio::ConnectionManager;
use redis::Client;

pub struct CacheManager {
    pub manager: ConnectionManager,
}

impl CacheManager {
    pub async fn new(redis_url: &str) -> anyhow::Result<Self> {
        let client = Client::open(redis_url)?;
        let manager = ConnectionManager::new(client).await?;
        Ok(Self { manager })
    }

    pub async fn get(&self, key: &str) -> anyhow::Result<Option<String>> {
        use redis::AsyncCommands;
        let mut conn = self.manager.clone();
        let value: Option<String> = conn.get(key).await?;
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // Add simple test stub
    #[test]
    fn test_cache_placeholder() {
        assert!(true);
    }
}
