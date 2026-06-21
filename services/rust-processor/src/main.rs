mod config;
mod models;
mod cache;
mod minio_writer;
mod processor;
mod kafka_consumer;
mod api;

use std::sync::Arc;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    env_logger::init();
    log::info!("Starting OSRS Rust Processor...");

    let config = Arc::new(config::Config::from_env().unwrap_or_else(|e| {
        log::error!("Error parsing config: {}", e);
        std::process::exit(1);
    }));

    let cache = Arc::new(cache::CacheManager::new(&config.redis_url).await?);
    let processor = Arc::new(processor::Processor::new(&config, cache.clone()).await?);
    let minio_writer = Arc::new(minio_writer::MinioWriter::new(
        &config.minio_endpoint,
        &config.minio_root_user,
        &config.minio_root_password,
    ).await);

    // Spawn Kafka Consumer loop in the background
    let config_clone = config.clone();
    let processor_clone = processor.clone();
    let minio_writer_clone = minio_writer.clone();
    tokio::spawn(async move {
        if let Err(e) = kafka_consumer::run_consumer(config_clone, processor_clone, minio_writer_clone).await {
            log::error!("Kafka consumer error: {}", e);
        }
    });

    // Run Actix-web server
    api::run_server(cache).await?;

    Ok(())
}
