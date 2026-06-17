# Walkthrough - OSRS Market Tracker (Phases 1 & 2)

This walkthrough details the changes made and verified to satisfy the requirements for both Phase 1 and Phase 2.

## Phase 3 Changes

### 1. Item Names in "Top 10 Price Movers"
- Resolved a bug where items were listed by their ID rather than their name when the GraphQL items map was empty.
- Pushed item name resolution to the backend: the `/analytics/top-movers` endpoint now queries the Postgres `items_metadata` database directly to attach item names.
- Updated `PriceTable.tsx` to read the resolved `name` directly from the API response with a robust fallback system.

### 2. Daily Midnight Refresh for Top Movers
- Created a new PostgreSQL table `public.daily_top_movers` to store pre-computed daily mover results.
- Added a new Airflow DAG `osrs_daily_top_movers` ([daily_top_movers.py](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/airflow/dags/daily_top_movers.py)) scheduled to run daily at midnight (`0 0 * * *`). It computes top movers from raw ticks in MinIO, maps their names from PostgreSQL, and truncates/populates the static `daily_top_movers` table.
- Updated `/analytics/top-movers` in the FastAPI analytics service to query from `daily_top_movers` directly, eliminating heavy DuckDB runs on every click and guaranteeing data only updates every 24 hours.

### 3. MinIO Data Staging & Readiness Check
- Added an internal retry loop to the `/items/{item_id}/history` endpoint in `services/analytics/main.py`. If a query returns 0 rows (indicating a write in progress or S3 delay), the backend stages the request and retries up to 5 times (1s interval) before returning data.
- This prevents the front-end from erroneously showing a "NO HISTORICAL DATA" alert while data is being staged/written in MinIO.

---

## Phase 2 Changes

### 1. Zustand State Management & Clean Prop-less Components
- Installed the `zustand` package in the Next.js service.
- Created a global store in [useStore.ts](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/store/useStore.ts) containing global states:
  - `selectedItemId` (defaults to `2` / Cannonball)
  - `selectedItemName` (defaults to `'Cannonball'`)
  - `refreshKey`
  - `triggeredAlerts`
- Refactored [page.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/app/page.tsx), [ItemSidebar.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/ItemSidebar.tsx), [PriceTable.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/PriceTable.tsx), and [PriceChart.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/PriceChart.tsx) to pull and mutate state from this store, completely eliminating prop drilling.

### 2. App Crash Fixes & Defensive UI
- Added defensive types and typecasting (`Number(itemId)`) to prevent mismatches between string and integer IDs when selecting top movers.
- Wrapped the Recharts components inside [PriceChart.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/PriceChart.tsx) inside a custom `ChartErrorBoundary` to catch any data serialization or rendering errors without crashing the main application.
- Added safe fallbacks for item names (`(itemName || '').toUpperCase()`) to avoid reading properties of undefined errors.

### 3. Missing Icon Fetching via WeirdGloop Mirror
- Stopped relying entirely on incomplete local `/assets/icons` image assets.
- Updated all item `<img className="item-icon">` sources in [ItemSidebar.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/ItemSidebar.tsx), [PriceTable.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/PriceTable.tsx), and [page.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/app/page.tsx) to fetch from the complete external sprite mirror:
  `https://chisel.weirdgloop.org/static/img/osrs-sprite/${itemId}.png`
- Kept the `onError` fallback logic to display the default `?` box if an icon is unavailable.

### 4. Noisy "Penny" Items Filter
- Modified the `/analytics/top-movers` DuckDB query in [main.py](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/analytics/main.py#L159-L165) to exclude items with a starting price under 100gp (`WHERE s.start_price >= 100`).
- This filters out low-value items where tiny price fluctuations register as inflated percentage moves (e.g. 1gp to 2gp showing 100%).

### 5. Daily Item History Aggregation via dbt-core
- Initialized a new dbt project `osrs_dbt` at [services/dbt](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/dbt).
- Configured [profiles.yml](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/dbt/profiles.yml) for `dbt-duckdb` containing the MinIO target credentials (with S3 url style path).
- Developed a dbt mart [daily_item_history.sql](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/dbt/models/marts/daily_item_history.sql) that reads all raw 5-minute ticks parquet files from MinIO, aggregates them daily (averaging prices and volumes), and materializes the output directly back to MinIO as:
  `s3://osrs-parquet/marts/daily/daily_item_history.parquet`
- Updated the `/items/{item_id}/history` endpoint in [main.py](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/analytics/main.py#L78-L101) to automatically read from this pre-aggregated daily mart when requested history timeframe `days >= 7`, dramatically reducing query latency and returning exactly 1 data point per day.

---

## Phase 1 Changes

### 1. Top 10 Price Movers
- Added a `limit` parameter (default `10`) to the `/analytics/top-movers` GET endpoint in the FastAPI analytics service ([main.py](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/analytics/main.py#L122-L130)).
- Parameterized the DuckDB SQL query to enforce `LIMIT ?` ([main.py](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/analytics/main.py#L157-L163)).
- Updated the NextJS frontend to change the panel title to `"TOP 10 PRICE MOVERS (LAST 24 HOURS)"` ([PriceTable.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/PriceTable.tsx#L43-L49)).

### 2. Icon Image Preloader
- Modified `ReadinessGate` in [page.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/app/page.tsx#L96-L170) to perform preloading of all critical visible item icons when backend services are ready.
  - Queries top movers to extract item IDs.
  - Queries the first 20 sidebar items from the Hasura GraphQL endpoint.
  - Preloads all retrieved URLs along with the default selected item icon (`/assets/icons/2.png`) using JavaScript `Image` loaders.
- Updated the global `<LoadingScreen />` ([LoadingScreen.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/LoadingScreen.tsx)) checklist to include `ITEM ICONS` state. The overlay blocks site usage until preloading resolves.

### 3. Sidebar Padding
- Increased `itemSize` from `46` to `64` in the virtualized `FixedSizeList` in [ItemSidebar.tsx](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/components/ItemSidebar.tsx#L154-L163).
- Updated padding for `.item-card` class in [globals.css](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/nextjs/src/app/globals.css#L195-L203) to `14px 12px` (from `10px`).

### 4. MinIO 30-Day Backfill
- Created a python script run as a manual DAG in Airflow ([backfill_30_days.py](file:///Users/samirkatakamsetty/Desktop/Home/Data%20Engineering%20Projects/osrs-market/services/airflow/dags/backfill_30_days.py)) that connects to Postgres metadata table to pull OSRS mapping list.
- Generates a random-walk price tick history for all 4,572 items over the past 30 days (every 4 hours, generating ~827,000 tick records).
- Connects to MinIO and writes partitioned Parquet files directly to the S3 bucket (`s3://osrs-parquet/ticks/year=YYYY/month=MM/day=DD/`) using DuckDB's HTTPFS extension.
