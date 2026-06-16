import os
import subprocess
import logging
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator

logger = logging.getLogger(__name__)

default_args = {
    'owner': 'airflow',
    'depends_on_past': False,
    'start_date': datetime(2026, 1, 1),
    'email_on_failure': False,
    'email_on_retry': False,
    'retries': 0,
}

def monitor_and_restart_spark():
    container_name = "osrs-spark"
    job_path = "/opt/spark/jobs/price_stream.py"
    
    # Check if price_stream.py is running in the spark container
    check_cmd = f"docker exec {container_name} pgrep -f {job_path}"
    logger.info(f"Checking if Spark streaming job is running with: {check_cmd}")
    
    try:
        # Run command via shell. Note: Airflow scheduler runs inside docker, so it needs to talk to the docker socket.
        # Since we mounted /var/run/docker.sock, we can run 'docker' commands if the docker CLI is installed.
        # But wait! If the apache/airflow image does not have the docker CLI installed, running 'docker' directly will fail!
        # In that case, we can use the Docker HTTP API directly using requests over the unix socket,
        # OR we can install the docker CLI / use python 'docker' package.
        # Let's write a python check that uses the standard docker python library if available,
        # or falls back to using the Docker daemon Unix socket via a simple python socket or HTTP request.
        # Using requests_unixsocket or a simple python socket to talk to /var/run/docker.sock is extremely robust
        # and has zero external binary dependencies!
        import socket
        import json
        
        # Test connection to docker socket
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect("/var/run/docker.sock")
        
        # Send HTTP GET /containers/json to find osrs-spark ID
        req = b"GET /containers/json HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        s.sendall(req)
        
        resp = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            resp += chunk
        s.close()
        
        # Parse HTTP response
        header_part, body_part = resp.split(b"\r\n\r\n", 1)
        # Handle chunked transfer encoding if present
        if b"Transfer-Encoding: chunked" in header_part:
            # Simple chunked parser
            lines = body_part.split(b"\r\n")
            body_part = b""
            i = 0
            while i < len(lines):
                if not lines[i]:
                    break
                chunk_len = int(lines[i].split(b";")[0], 16)
                if chunk_len == 0:
                    break
                body_part += lines[i+1]
                i += 2
                
        containers = json.loads(body_part.decode('utf-8'))
        spark_container = None
        for c in containers:
            if f"/{container_name}" in c.get("Names", []):
                spark_container = c
                break
                
        if not spark_container:
            logger.error(f"Container {container_name} not found!")
            return
            
        logger.info(f"Container {container_name} is running. Container ID: {spark_container['Id']}")
        
        # Now let's execute 'pgrep -f /opt/spark/jobs/price_stream.py' inside the container
        # We do this by posting to /containers/{id}/exec
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect("/var/run/docker.sock")
        
        exec_create_payload = json.dumps({
            "AttachStdout": True,
            "AttachStderr": True,
            "Cmd": ["pgrep", "-f", job_path]
        })
        
        req = f"POST /containers/{container_name}/exec HTTP/1.1\r\n" \
              f"Host: localhost\r\n" \
              f"Content-Type: application/json\r\n" \
              f"Content-Length: {len(exec_create_payload)}\r\n" \
              f"Connection: close\r\n\r\n" \
              f"{exec_create_payload}"
              
        s.sendall(req.encode('utf-8'))
        resp = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            resp += chunk
        s.close()
        
        header_part, body_part = resp.split(b"\r\n\r\n", 1)
        exec_id = json.loads(body_part.decode('utf-8'))["Id"]
        
        # Start the exec
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect("/var/run/docker.sock")
        exec_start_payload = json.dumps({"Detach": False, "Tty": False})
        req = f"POST /exec/{exec_id}/start HTTP/1.1\r\n" \
              f"Host: localhost\r\n" \
              f"Content-Type: application/json\r\n" \
              f"Content-Length: {len(exec_start_payload)}\r\n" \
              f"Connection: close\r\n\r\n" \
              f"{exec_start_payload}"
        s.sendall(req.encode('utf-8'))
        resp = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            resp += chunk
        s.close()
        
        # Get exec status to see exit code
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.connect("/var/run/docker.sock")
        req = f"GET /exec/{exec_id}/json HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n"
        s.sendall(req.encode('utf-8'))
        resp = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            resp += chunk
        s.close()
        
        header_part, body_part = resp.split(b"\r\n\r\n", 1)
        exec_status = json.loads(body_part.decode('utf-8'))
        exit_code = exec_status.get("ExitCode")
        
        if exit_code == 0:
            logger.info("Spark streaming job is running normally.")
        else:
            logger.warning(f"Spark streaming job process not found (exit code: {exit_code}). Restarting/starting it...")
            # Trigger spark-submit inside the container
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            s.connect("/var/run/docker.sock")
            
            # Packages we need: spark-sql-kafka-0-10, spark-avro, postgresql jdbc, hadoop-aws
            submit_cmd = [
                "spark-submit",
                "--packages", "org.apache.spark:spark-sql-kafka-0-10_2.12:3.5.0,org.apache.spark:spark-avro_2.12:3.5.0,org.postgresql:postgresql:42.6.0,org.apache.hadoop:hadoop-aws:3.3.4,com.amazonaws:aws-java-sdk-bundle:1.12.262",
                job_path
            ]
            
            exec_submit_payload = json.dumps({
                "AttachStdout": False,
                "AttachStderr": False,
                "Cmd": submit_cmd
            })
            
            req = f"POST /containers/{container_name}/exec HTTP/1.1\r\n" \
                  f"Host: localhost\r\n" \
                  f"Content-Type: application/json\r\n" \
                  f"Content-Length: {len(exec_submit_payload)}\r\n" \
                  f"Connection: close\r\n\r\n" \
                  f"{exec_submit_payload}"
            s.sendall(req.encode('utf-8'))
            resp = b""
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                resp += chunk
            s.close()
            
            header_part, body_part = resp.split(b"\r\n\r\n", 1)
            submit_exec_id = json.loads(body_part.decode('utf-8'))["Id"]
            
            # Start exec detached (so it runs in the background)
            s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            s.connect("/var/run/docker.sock")
            exec_start_payload = json.dumps({"Detach": True, "Tty": False})
            req = f"POST /exec/{submit_exec_id}/start HTTP/1.1\r\n" \
                  f"Host: localhost\r\n" \
                  f"Content-Type: application/json\r\n" \
                  f"Content-Length: {len(exec_start_payload)}\r\n" \
                  f"Connection: close\r\n\r\n" \
                  f"{exec_start_payload}"
            s.sendall(req.encode('utf-8'))
            s.close()
            logger.info("Spark streaming job started successfully in background.")
            
    except Exception as e:
        logger.error(f"Error communicating with Docker socket: {e}")

with DAG(
    'spark_streaming_watchdog',
    default_args=default_args,
    description='Monitor and auto-restart OSRS Spark streaming job',
    schedule_interval='*/5 * * * *',
    catchup=False,
) as dag:

    watchdog_task = PythonOperator(
        task_id='monitor_and_restart',
        python_callable=monitor_and_restart_spark,
    )
