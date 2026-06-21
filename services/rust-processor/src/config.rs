use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    pub redpanda_brokers: String,
    pub schema_registry_url: String,
    pub minio_endpoint: String,
    pub minio_root_user: String,
    pub minio_root_password: String,
    pub redis_url: String,
    pub postgres_host: String,
    pub postgres_db: String,
    pub postgres_user: String,
    pub postgres_password: String,
    pub worker_count: usize,
    pub batch_size: usize,
    pub max_upload_concurrency: usize,
    pub priority_price_threshold: i64,
    pub priority_volume_threshold: i64,
}

impl Config {
    pub fn from_env() -> Result<Self, envy::Error> {
        dotenvy::dotenv().ok();
        envy::from_env::<Config>()
    }
}
