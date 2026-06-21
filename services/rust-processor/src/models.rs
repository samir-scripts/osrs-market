use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OsrsPriceTick {
    pub item_id: i64,
    pub timestamp: i64,
    pub avg_high_price: Option<i64>,
    pub high_price_volume: Option<i64>,
    pub avg_low_price: Option<i64>,
    pub low_price_volume: Option<i64>,
}
