import urllib.request
import json

def fetch_and_seed_item_types():
    print("Fetching OSRSBox item data...")
    url = "https://raw.githubusercontent.com/osrsbox/osrsbox-db/master/docs/items-complete.json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
    
    print(f"Parsing types for {len(data)} items...")
    sql_lines = [
        "BEGIN;",
        "CREATE TEMP TABLE temp_item_types (item_id INT, type_name VARCHAR(100));"
    ]
    
    values = []
    for item_id_str, item in data.items():
        item_id = int(item_id_str)
        item_type = "Misc"
        if item.get("equipable") or item.get("equipable_by_player") or item.get("equipment"):
            equipment = item.get("equipment", {})
            if equipment:
                item_type = equipment.get("slot", "Equipment").capitalize()
            else:
                item_type = "Equipment"
        elif item.get("weapon"):
            item_type = "Weapon"
        elif item.get("stacked"):
            item_type = "Resource/Stackable"
        elif item.get("quest_item"):
            item_type = "Quest Item"
        
        if item.get("weapon") and item.get("weapon").get("weapon_type"):
            item_type = item.get("weapon").get("weapon_type").capitalize()
            
        type_name_escaped = item_type.replace("'", "''")
        values.append(f"({item_id}, '{type_name_escaped}')")
        
        # Batch to prevent huge inserts
        if len(values) >= 500:
            sql_lines.append(f"INSERT INTO temp_item_types (item_id, type_name) VALUES {', '.join(values)};")
            values = []

    if values:
        sql_lines.append(f"INSERT INTO temp_item_types (item_id, type_name) VALUES {', '.join(values)};")
        
    sql_lines.extend([
        "INSERT INTO public.item_types (item_id, type_name)",
        "SELECT t.item_id, t.type_name",
        "FROM temp_item_types t",
        "JOIN public.items_metadata m ON t.item_id = m.item_id",
        "ON CONFLICT (item_id) DO UPDATE SET type_name = EXCLUDED.type_name;",
        "COMMIT;"
    ])
    
    with open('infra/seed.sql', 'w') as f:
        f.write('\n'.join(sql_lines))
        
    print("Generated infra/seed.sql successfully.")

if __name__ == "__main__":
    fetch_and_seed_item_types()
