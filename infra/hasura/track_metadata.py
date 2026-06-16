import urllib.request
import json
import time
import sys

HASURA_URL = "http://localhost:8082"
ADMIN_SECRET = "hasura_secure_admin_secret"

def wait_for_hasura():
    print("Waiting for Hasura to become healthy...")
    for _ in range(30):
        try:
            req = urllib.request.Request(f"{HASURA_URL}/healthz")
            with urllib.request.urlopen(req) as response:
                if response.status == 200:
                    print("Hasura is healthy!")
                    return True
        except Exception:
            pass
        time.sleep(2)
    print("Hasura healthcheck timed out.")
    return False

def send_metadata_query(query):
    url = f"{HASURA_URL}/v1/metadata"
    headers = {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": ADMIN_SECRET
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(query).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return json.loads(res_body)
    except Exception as e:
        print(f"Metadata API query failed: {e}")
        # Read error body if available
        if hasattr(e, "read"):
            print(e.read().decode("utf-8"))
        return None

def track_tables():
    print("Tracking tables in Hasura...")
    
    # 1. Track items_metadata
    track_items = {
        "type": "pg_track_table",
        "args": {
            "source": "default",
            "table": {"schema": "public", "name": "items_metadata"}
        }
    }
    send_metadata_query(track_items)
    
    # 2. Track latest_item_prices
    track_prices = {
        "type": "pg_track_table",
        "args": {
            "source": "default",
            "table": {"schema": "public", "name": "latest_item_prices"}
        }
    }
    send_metadata_query(track_prices)
    
    # 3. Track active_price_alerts
    track_alerts = {
        "type": "pg_track_table",
        "args": {
            "source": "default",
            "table": {"schema": "public", "name": "active_price_alerts"}
        }
    }
    send_metadata_query(track_alerts)

def track_relationships():
    print("Tracking relationships in Hasura...")
    
    # 1. Object relationship: latest_item_prices -> items_metadata
    rel_prices_to_meta = {
        "type": "pg_create_object_relationship",
        "args": {
            "source": "default",
            "table": {"schema": "public", "name": "latest_item_prices"},
            "name": "item_metadata",
            "using": {
                "foreign_key_constraint_on": "item_id"
            }
        }
    }
    send_metadata_query(rel_prices_to_meta)

    # 2. Array relationship: items_metadata -> latest_item_prices
    rel_meta_to_prices = {
        "type": "pg_create_array_relationship",
        "args": {
            "source": "default",
            "table": {"schema": "public", "name": "items_metadata"},
            "name": "prices",
            "using": {
                "foreign_key_constraint_on": {
                    "table": {"schema": "public", "name": "latest_item_prices"},
                    "column": "item_id"
                }
            }
        }
    }
    send_metadata_query(rel_meta_to_prices)

def main():
    if not wait_for_hasura():
        sys.exit(1)
        
    track_tables()
    track_relationships()
    print("Hasura metadata configuration completed!")

if __name__ == "__main__":
    main()
