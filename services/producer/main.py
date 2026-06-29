from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator
from api import router
from scheduler import scheduler
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

app = FastAPI(title="OSRS Market Ingestion Producer", version="1.0")

Instrumentator().instrument(app).expose(app)

app.include_router(router)

@app.on_event("startup")
def startup_event():
    scheduler.start()

@app.on_event("shutdown")
def shutdown_event():
    scheduler.stop()
