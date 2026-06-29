import pytest
import requests_mock
from osrs_client import osrs_client

def test_fetch_and_produce_prices_success(mocker):
    mock_produce = mocker.patch("kafka_client.kafka_client.produce")
    mock_flush = mocker.patch("kafka_client.kafka_client.flush")
    
    with requests_mock.Mocker() as m:
        m.get("https://prices.runescape.wiki/api/v1/osrs/5m", json={
            "data": {
                "4151": {
                    "avgHighPrice": 1200000,
                    "highPriceVolume": 5,
                    "avgLowPrice": 1190000,
                    "lowPriceVolume": 10
                }
            },
            "timestamp": 123456789
        })
        
        result = osrs_client.fetch_and_produce_prices()
        assert result is True
        mock_produce.assert_called_once()
        mock_flush.assert_called_once()

def test_fetch_and_produce_prices_failure():
    with requests_mock.Mocker() as m:
        m.get("https://prices.runescape.wiki/api/v1/osrs/5m", status_code=500)
        result = osrs_client.fetch_and_produce_prices()
        assert result is False
