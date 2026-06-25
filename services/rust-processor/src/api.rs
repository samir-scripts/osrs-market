use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use crate::cache::CacheManager;
use std::sync::Arc;
use redis::AsyncCommands;
use serde_json::json;
use serde::Deserialize;

#[derive(Deserialize)]
struct HistoryQuery {
    days: Option<i64>,
}

struct AppState {
    cache: Arc<CacheManager>,
}

async fn health() -> impl Responder {
    HttpResponse::Ok().json(json!({"status": "ok"}))
}

async fn top_movers(_data: web::Data<AppState>) -> impl Responder {
    // Mock top movers
    HttpResponse::Ok().json(json!({"top_movers": []}))
}

async fn get_item_history(path: web::Path<i64>, query: web::Query<HistoryQuery>, _data: web::Data<AppState>) -> impl Responder {
    let item_id = path.into_inner();
    let days = query.days.unwrap_or(7);
    let cutoff = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64 - (days * 86400);

    let result = actix_web::web::block(move || {
        use duckdb::Connection;
        
        let conn = Connection::open_in_memory().map_err(|e| e.to_string())?;
        
        // Load httpfs and configure MinIO credentials
        conn.execute_batch(
            "INSTALL httpfs;
             LOAD httpfs;
             SET s3_endpoint='minio:9000';
             SET s3_access_key_id='minioadmin';
             SET s3_secret_access_key='minioadmin_secure_pass';
             SET s3_use_ssl=false;
             SET s3_region='us-east-1';
             SET s3_url_style='path';"
        ).map_err(|e| e.to_string())?;

        let query = format!(
            "SELECT timestamp, avg_high_price, high_price_volume, avg_low_price, low_price_volume 
             FROM read_parquet('s3://osrs-parquet/ticks/**/*.parquet', hive_partitioning=1) 
             WHERE item_id = {} AND timestamp >= {} ORDER BY timestamp ASC",
            item_id, cutoff
        );

        let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
        
        let rows = stmt.query_map([], |row| {
            Ok(json!({
                "timestamp": row.get::<_, i64>(0)?,
                "avgHighPrice": row.get::<_, Option<i64>>(1)?,
                "highPriceVolume": row.get::<_, Option<i64>>(2)?,
                "avgLowPrice": row.get::<_, Option<i64>>(3)?,
                "lowPriceVolume": row.get::<_, Option<i64>>(4)?
            }))
        }).map_err(|e| e.to_string())?;

        let mut data = Vec::new();
        for row in rows {
            if let Ok(val) = row {
                data.push(val);
            }
        }
        
        Ok::<Vec<serde_json::Value>, String>(data)
    }).await;

    match result {
        Ok(Ok(data)) => HttpResponse::Ok().json(json!({"source": "db", "data": data})),
        Ok(Err(e)) => {
            log::error!("DuckDB error: {}", e);
            HttpResponse::Ok().json(json!({"source": "db", "data": []}))
        },
        Err(_) => HttpResponse::Ok().json(json!({"source": "db", "data": []}))
    }
}

pub async fn run_server(cache: Arc<CacheManager>) -> std::io::Result<()> {
    let state = web::Data::new(AppState { cache });
    
    log::info!("Starting Actix-web server on port 8001");
    
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .route("/health", web::get().to(health))
            .route("/analytics/top-movers", web::get().to(top_movers))
            .route("/items/{item_id}/history", web::get().to(get_item_history))
    })
    .bind(("0.0.0.0", 8001))?
    .run()
    .await
}
