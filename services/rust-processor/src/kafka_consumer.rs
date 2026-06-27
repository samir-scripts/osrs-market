use crate::config::Config;
use crate::models::OsrsPriceTick;
use crate::processor::Processor;
use crate::minio_writer::MinioWriter;
use anyhow::Result;
use rdkafka::consumer::{Consumer, StreamConsumer, CommitMode};
use rdkafka::ClientConfig;
use rdkafka::Message;
use std::sync::Arc;

pub async fn run_consumer(config: Arc<Config>, processor: Arc<Processor>, minio_writer: Arc<MinioWriter>) -> Result<()> {
    let consumer: StreamConsumer = ClientConfig::new()
        .set("group.id", "osrs-rust-processor-group")
        .set("bootstrap.servers", &config.redpanda_brokers)
        .set("auto.offset.reset", "latest")
        .create()?;

    consumer.subscribe(&["osrs.price-ticks.raw"])?;
    
    log::info!("Started Kafka consumer on topic osrs.price-ticks.raw");

    let mut batch = Vec::new();

    loop {
        match consumer.recv().await {
            Err(e) => log::error!("Kafka error: {}", e),
            Ok(m) => {
                if let Some(payload) = m.payload() {
                    // Fastavro style parsing. Skip 5 bytes confluent header (1 byte magic, 4 byte schema id)
                    if payload.len() > 5 {
                        // Mock deserialization for demonstration
                        let tick = OsrsPriceTick {
                            item_id: 4151, // Abyssal whip mock
                            timestamp: chrono::Utc::now().timestamp(),
                            avg_high_price: Some(1500000),
                            high_price_volume: Some(10),
                            avg_low_price: Some(1450000),
                            low_price_volume: Some(15),
                        };

                        let high_price = tick.avg_high_price.unwrap_or(0);
                        let vol = tick.high_price_volume.unwrap_or(0) + tick.low_price_volume.unwrap_or(0);
                        
                        if high_price > config.priority_price_threshold || vol > config.priority_volume_threshold {
                            batch.push(tick);
                        }

                        if batch.len() >= config.batch_size {
                            let batch_to_process = std::mem::replace(&mut batch, Vec::new());
                            
                            // Process asynchronously
                            let proc = processor.clone();
                            let mw = minio_writer.clone();
                            tokio::spawn(async move {
                                if let Err(e) = proc.process_ticks(batch_to_process.clone()).await {
                                    log::error!("Failed to process ticks: {}", e);
                                }
                                if let Err(e) = mw.upload_ticks(&batch_to_process).await {
                                    log::error!("Failed to upload ticks to MinIO: {}", e);
                                }
                            });
                        }
                    }
                }
                // Async commit
                consumer.commit_message(&m, CommitMode::Async).unwrap();
            }
        };
    }
}
