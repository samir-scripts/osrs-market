use anyhow::Result;
use crate::models::OsrsPriceTick;
use aws_sdk_s3::Client;
use aws_sdk_s3::config::{Credentials, Region, Builder};
use chrono::{DateTime, Utc};

pub struct MinioWriter {
    client: Client,
    bucket: String,
}

impl MinioWriter {
    pub async fn new(endpoint: &str, root_user: &str, root_password: &str) -> Self {
        let credentials = Credentials::new(root_user, root_password, None, None, "minio");
        let config = Builder::new()
            .endpoint_url(endpoint)
            .region(Region::new("us-east-1"))
            .credentials_provider(credentials)
            .force_path_style(true)
            .build();
        let client = Client::from_conf(config);
        
        Self {
            client,
            bucket: "osrs-parquet".to_string(),
        }
    }

    pub async fn upload_ticks(&self, ticks: &[OsrsPriceTick]) -> Result<()> {
        if ticks.is_empty() {
            return Ok(());
        }
        
        let now: DateTime<Utc> = Utc::now();
        let year = now.format("%Y");
        let month = now.format("%m");
        let day = now.format("%d");
        let key = format!("ticks/year={}/month={}/day={}/ticks_{}.parquet", year, month, day, now.timestamp_millis());

        log::info!("Uploading {} ticks to s3://{}/{}", ticks.len(), self.bucket, key);
        
        use arrow::array::Int64Builder;
        use arrow::datatypes::{DataType, Field, Schema};
        use arrow::record_batch::RecordBatch;
        use parquet::arrow::ArrowWriter;
        use std::sync::Arc;

        let schema = Arc::new(Schema::new(vec![
            Field::new("item_id", DataType::Int64, false),
            Field::new("timestamp", DataType::Int64, false),
            Field::new("avg_high_price", DataType::Int64, true),
            Field::new("high_price_volume", DataType::Int64, true),
            Field::new("avg_low_price", DataType::Int64, true),
            Field::new("low_price_volume", DataType::Int64, true),
        ]));

        let mut item_id_b = Int64Builder::new();
        let mut timestamp_b = Int64Builder::new();
        let mut avg_high_price_b = Int64Builder::new();
        let mut high_price_volume_b = Int64Builder::new();
        let mut avg_low_price_b = Int64Builder::new();
        let mut low_price_volume_b = Int64Builder::new();

        for tick in ticks {
            item_id_b.append_value(tick.item_id as i64);
            timestamp_b.append_value(tick.timestamp);
            if let Some(v) = tick.avg_high_price { avg_high_price_b.append_value(v); } else { avg_high_price_b.append_null(); }
            if let Some(v) = tick.high_price_volume { high_price_volume_b.append_value(v); } else { high_price_volume_b.append_null(); }
            if let Some(v) = tick.avg_low_price { avg_low_price_b.append_value(v); } else { avg_low_price_b.append_null(); }
            if let Some(v) = tick.low_price_volume { low_price_volume_b.append_value(v); } else { low_price_volume_b.append_null(); }
        }

        let batch = RecordBatch::try_new(
            schema.clone(),
            vec![
                Arc::new(item_id_b.finish()),
                Arc::new(timestamp_b.finish()),
                Arc::new(avg_high_price_b.finish()),
                Arc::new(high_price_volume_b.finish()),
                Arc::new(avg_low_price_b.finish()),
                Arc::new(low_price_volume_b.finish()),
            ],
        )?;

        let mut buf = Vec::new();
        {
            let mut writer = ArrowWriter::try_new(&mut buf, schema, None)?;
            writer.write(&batch)?;
            writer.close()?;
        }

        self.client.put_object()
            .bucket(&self.bucket)
            .key(&key)
            .body(buf.into())
            .send()
            .await?;

        Ok(())
    }
}
