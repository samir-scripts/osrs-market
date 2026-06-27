from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
import pendulum
from datetime import timedelta

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=1),
}

def extract_and_load(**context):
    import requests
    import clickhouse_connect
    import json
    import logging
    
    interval_end = context['data_interval_end']
    timestamp = int(interval_end.timestamp())
    
    url = f"https://prices.runescape.wiki/api/v1/osrs/5m?timestamp={timestamp}"
    headers = {
        'User-Agent': 'osrs-market-tracker-airflow'
    }
    
    logging.info(f"Fetching data for timestamp: {timestamp} (interval_end: {interval_end})")
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    
    data = response.json()
    
    client = clickhouse_connect.get_client(
        host='clickhouse', 
        port=8123, 
        username='default', 
        password='password'
    )
    
    # Insert JSON string into raw_osrs_prices
    client.insert('default.raw_osrs_prices', [[json.dumps(data)]], column_names=['raw_data'])
    logging.info("Successfully inserted raw data into ClickHouse.")

with DAG(
    'osrs_wiki_extraction',
    default_args=default_args,
    description='Extract 5m price data from OSRS Wiki API and load to ClickHouse',
    schedule_interval='*/5 * * * *',
    start_date=pendulum.now('UTC').subtract(hours=1), # Start 1 hour ago for testing catchup
    catchup=True,
    max_active_runs=1,
) as dag:

    extract_load_task = PythonOperator(
        task_id='extract_and_load_clickhouse',
        python_callable=extract_and_load,
    )

    dbt_run_task = BashOperator(
        task_id='run_dbt_models',
        bash_command='cd /opt/airflow/dbt && dbt run --profiles-dir . --select silver gold',
    )
    
    extract_load_task >> dbt_run_task
