import requests
import dateutil.parser

def check_airflow():
    try:
        url = "http://localhost:8085/api/v1/dags/osrs_wiki_extraction"
        # We exposed airflow webserver on 8085 on the host
        res = requests.get(url, auth=("admin", "admin"))
        if res.status_code == 200:
            data = res.json()
            next_run = data.get("next_dagrun")
            if next_run:
                dt = dateutil.parser.isoparse(next_run)
                print("Next run ts:", int(dt.timestamp()))
            else:
                print("next_dagrun not found in:", data)
        else:
            print("Failed", res.status_code, res.text)
    except Exception as e:
        print("Error:", e)

check_airflow()
