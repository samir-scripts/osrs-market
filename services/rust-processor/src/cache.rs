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
}
