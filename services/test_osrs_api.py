import requests

url = "https://prices.runescape.wiki/api/v1/osrs/5m?timestamp=1718582400"
headers = {"User-Agent": "OSRS Price Tracker - @DevelopmentSandbox"}
try:
    response = requests.get(url, headers=headers, timeout=10)
    print("Status:", response.status_code)
    payload = response.json()
    print("Timestamp:", payload.get("timestamp"))
    print("Data keys count:", len(payload.get("data", {})))
except Exception as e:
    print("Error:", e)
