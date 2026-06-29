use actix_web::{web, App, HttpResponse, HttpServer, Responder};
use crate::cache::CacheManager;
use crate::repository::ClickhouseRepository;
use crate::config::Config;
use std::sync::Arc;
use serde_json::json;
use serde::Deserialize;

#[derive(Deserialize)]
struct HistoryQuery {
    days: Option<i64>,
}

struct AppState {
    cache: Arc<CacheManager>,
    clickhouse: Arc<ClickhouseRepository>,
}

async fn health() -> impl Responder {
    HttpResponse::Ok().json(json!({"status": "ok"}))
}

async fn top_movers(data: web::Data<AppState>) -> impl Responder {
    let cache_key = "api:top_movers";
    if let Ok(Some(cached_val)) = data.cache.get(cache_key).await {
        if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&cached_val) {
            return HttpResponse::Ok().json(json!({"source": "cache", "data": json_val}));
        }
    }

    match data.clickhouse.get_top_movers().await {
        Ok(json_res) => {
            if let Some(data_array) = json_res.get("data") {
                // Map the result if needed
                let mut mapped = Vec::new();
                if let Some(arr) = data_array.as_array() {
                    for row in arr {
                        mapped.push(json!({
                            "item_id": row["item_id"],
                            "avg_high_price": row["avg_high_price"],
                            "prev_avg_high_price": row["prev_avg_high_price"],
                            "price_change_percent": row["price_change_percent"]
                        }));
                    }
                }
                
                // Try caching it
                let mut conn = data.cache.manager.clone();
                use redis::AsyncCommands;
                let _: Result<(), _> = conn.set_ex(cache_key, serde_json::to_string(&mapped).unwrap_or_default(), 300).await;
                
                HttpResponse::Ok().json(json!({"source": "clickhouse", "data": mapped}))
            } else {
                HttpResponse::Ok().json(json!({"source": "clickhouse", "data": []}))
            }
        },
        Err(e) => {
            log::error!("Failed to get top movers: {}", e);
            HttpResponse::Ok().json(json!({"source": "clickhouse", "data": []}))
        }
    }
}

async fn get_item_history(path: web::Path<i64>, query: web::Query<HistoryQuery>, data: web::Data<AppState>) -> impl Responder {
    let item_id = path.into_inner();
    let days = query.days.unwrap_or(30);
    
    let cache_key = format!("api:history:{}:{}", item_id, days);
    if let Ok(Some(cached_val)) = data.cache.get(&cache_key).await {
        if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(&cached_val) {
            return HttpResponse::Ok().json(json!({"source": "cache", "data": json_val}));
        }
    }
    
    match data.clickhouse.get_item_history(item_id, days).await {
        Ok(json_res) => {
            if let Some(data_array) = json_res.get("data") {
                let mut mapped = Vec::new();
                if let Some(arr) = data_array.as_array() {
                    for row in arr {
                        mapped.push(json!({
                            "timestamp": row["ts"],
                            "avgHighPrice": row["avgHighPrice"],
                            "highPriceVolume": row["highPriceVolume"],
                            "avgLowPrice": row["avgLowPrice"],
                            "lowPriceVolume": row["lowPriceVolume"]
                        }));
                    }
                }
                
                // Cache the response
                let mut conn = data.cache.manager.clone();
                use redis::AsyncCommands;
                let _: Result<(), _> = conn.set_ex(&cache_key, serde_json::to_string(&mapped).unwrap_or_default(), 300).await;

                HttpResponse::Ok().json(json!({"source": "clickhouse", "data": mapped}))
            } else {
                HttpResponse::Ok().json(json!({"source": "clickhouse", "data": []}))
            }
        },
        Err(e) => {
            log::error!("ClickHouse request failed: {}", e);
            HttpResponse::Ok().json(json!({"source": "clickhouse", "data": []}))
        }
    }
}

pub async fn run_server(cache: Arc<CacheManager>, config: Arc<Config>) -> std::io::Result<()> {
    let clickhouse = Arc::new(ClickhouseRepository::new(&config));
    let state = web::Data::new(AppState { cache, clickhouse });
    
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
