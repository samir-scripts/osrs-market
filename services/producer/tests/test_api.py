import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "producer_initialized" in data
    assert "is_running" in data
    assert "connection_status" in data

def test_get_schedule():
    response = client.get("/schedule")
    assert response.status_code == 200
    data = response.json()
    assert "last_fetched_at" in data

def test_trigger_poll(mocker):
    mocker.patch("osrs_client.osrs_client.fetch_and_produce_prices", return_value=True)
    response = client.post("/trigger")
    assert response.status_code == 200
    assert response.json() == {"status": "triggered"}
