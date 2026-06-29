-- Create schemas
CREATE SCHEMA IF NOT EXISTS airflow;

-- Items Metadata Table
CREATE TABLE IF NOT EXISTS public.items_metadata (
    item_id INT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    examine TEXT,
    members BOOLEAN DEFAULT FALSE,
    value INT,
    high_alch INT,
    low_alch INT,
    buy_limit INT,
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Item Types Table (populated separately from the main DAG)
CREATE TABLE IF NOT EXISTS public.item_types (
    item_id INT PRIMARY KEY REFERENCES public.items_metadata(item_id) ON DELETE CASCADE,
    type_name VARCHAR(100) NOT NULL
);

-- Latest Computed Prices & Metrics Table
CREATE TABLE IF NOT EXISTS public.latest_item_prices (
    item_id INT PRIMARY KEY REFERENCES public.items_metadata(item_id) ON DELETE CASCADE,
    avg_high_price BIGINT,
    avg_low_price BIGINT,
    previous_avg_high_price BIGINT,
    previous_avg_low_price BIGINT,
    high_price_volume BIGINT,
    low_price_volume BIGINT,
    moving_avg_1h BIGINT,
    moving_avg_24h BIGINT,
    moving_avg_7d BIGINT,
    volatility_24h DOUBLE PRECISION,
    momentum_24h DOUBLE PRECISION,
    last_updated TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price alerts (for optional alerting functionality)
CREATE TABLE IF NOT EXISTS public.active_price_alerts (
    alert_id SERIAL PRIMARY KEY,
    item_id INT REFERENCES public.items_metadata(item_id) ON DELETE CASCADE,
    price_threshold BIGINT NOT NULL,
    comparison_operator VARCHAR(2) NOT NULL, -- '>', '<', '>=', '<='
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Daily Top Movers Table
CREATE TABLE IF NOT EXISTS public.daily_top_movers (
    item_id INT REFERENCES public.items_metadata(item_id) ON DELETE CASCADE,
    name VARCHAR(255),
    start_price BIGINT,
    end_price BIGINT,
    pct_change DOUBLE PRECISION,
    volume BIGINT,
    computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
