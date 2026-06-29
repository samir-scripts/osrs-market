import pytest
from kafka_client import kafka_client

def test_produce_uninitialized():
    kafka_client.producer = None
    with pytest.raises(RuntimeError):
        kafka_client.produce("test_topic", "key", {"val": 1})

def test_produce_success(mocker):
    mock_producer = mocker.Mock()
    kafka_client.producer = mock_producer
    
    kafka_client.produce("test_topic", "key", {"val": 1})
    mock_producer.produce.assert_called_once_with(
        topic="test_topic",
        key="key",
        value={"val": 1},
        on_delivery=kafka_client.delivery_report
    )
