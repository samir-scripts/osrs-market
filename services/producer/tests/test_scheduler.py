import pytest
import asyncio
from scheduler import scheduler

@pytest.mark.asyncio
async def test_scheduler_stop():
    scheduler.start()
    assert scheduler.is_running is True
    assert scheduler.polling_task is not None
    
    scheduler.stop()
    try:
        await scheduler.polling_task
    except asyncio.CancelledError:
        pass
    assert scheduler.is_running is False
    assert scheduler.polling_task.cancelled() or scheduler.polling_task.done()

def test_fire_webhook(mocker, requests_mock):
    mocker.patch("scheduler.config.WEBHOOK_URL", "http://test-webhook.com")
    requests_mock.post("http://test-webhook.com", status_code=200)
    
    scheduler.last_fetched_at = 100
    scheduler.next_update_at = 200
    scheduler._fire_data_updated_webhook()
    
    assert requests_mock.called
    assert requests_mock.last_request.json() == {
        "event": "data_updated",
        "fetched_at": 100,
        "next_update_at": 200
    }
