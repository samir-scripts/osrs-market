from fastapi import APIRouter, BackgroundTasks
from scheduler import scheduler
from kafka_client import kafka_client
from osrs_client import osrs_client
from config import config

router = APIRouter()

@router.get("/health")
def health():
    return {
        "status": "healthy",
        "producer_initialized": kafka_client.producer is not None,
        "is_running": scheduler.is_running,
        "connection_status": scheduler.current_status
    }

@router.post("/trigger")
def trigger_poll(background_tasks: BackgroundTasks):
    background_tasks.add_task(osrs_client.fetch_and_produce_prices)
    return {"status": "triggered"}

@router.get("/schedule")
def get_schedule():
    return {
        "last_fetched_at": scheduler.last_fetched_at,
        "next_update_at": scheduler.next_update_at,
        "poll_interval_sec": config.POLL_INTERVAL_SEC,
        "connection_status": scheduler.current_status
    }
