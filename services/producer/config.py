import os

class Config:
    REDPANDA_BROKERS = os.getenv("REDPANDA_BROKERS", "redpanda:29092")
    SCHEMA_REGISTRY_URL = os.getenv("SCHEMA_REGISTRY_URL", "http://redpanda:8081")
    POLL_INTERVAL_SEC = int(os.getenv("POLL_INTERVAL_SEC", "300"))
    USER_AGENT = os.getenv("USER_AGENT", "OSRS Price Tracker - @DevelopmentSandbox")
    WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")

config = Config()
