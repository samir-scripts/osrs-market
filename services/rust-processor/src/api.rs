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
    let days = query.days.unwrap_or(30);
    
    // Choose downsampling interval based on time window
    let interval = if days <= 1 {
        "5 MINUTE"
    } else if days <= 7 {
        "1 HOUR"
    } else {
        "4 HOUR"
    };

    let ch_query = format!(
        "SELECT 
            toUnixTimestamp(toStartOfInterval(toDateTime(timestamp), INTERVAL {})) as ts,
            toUInt64(avg(avg_high_price)) as avgHighPrice,
            toUInt64(sum(high_price_volume)) as highPriceVolume,
            toUInt64(avg(avg_low_price)) as avgLowPrice,
            toUInt64(sum(low_price_volume)) as lowPriceVolume
         FROM osrs.clean_osrs_prices
         WHERE item_id = {} 
           AND timestamp >= toUnixTimestamp(now() - INTERVAL {} DAY)
         GROUP BY ts
         ORDER BY ts ASC
         FORMAT JSON",
        interval, item_id, days
    );

    let client = reqwest::Client::new();
    let resp = client.post("http://clickhouse:8123/")
        .basic_auth("default", Some("default"))
        .body(ch_query)
        .send()
        .await;

    match resp {
        Ok(res) if res.status().is_success() => {
            if let Ok(json) = res.json::<serde_json::Value>().await {
                if let Some(data) = json.get("data") {
                    // ClickHouse JSON format returns rows in "data" array
                    // Map keys to what the frontend expects
                    let mut mapped = Vec::new();
                    if let Some(arr) = data.as_array() {
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
                    return HttpResponse::Ok().json(json!({"source": "clickhouse", "data": mapped}));
                }
            }
            HttpResponse::Ok().json(json!({"source": "clickhouse", "data": []}))
        },
        Ok(res) => {
            log::error!("ClickHouse error: {:?}", res.text().await);
            HttpResponse::Ok().json(json!({"source": "clickhouse", "data": []}))
        },
        Err(e) => {
            log::error!("ClickHouse request failed: {}", e);
            HttpResponse::Ok().json(json!({"source": "clickhouse", "data": []}))
        }
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
