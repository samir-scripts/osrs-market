import os
import logging
from confluent_kafka import SerializingProducer
from confluent_kafka.serialization import StringSerializer
from confluent_kafka.schema_registry import SchemaRegistryClient
from confluent_kafka.schema_registry.avro import AvroSerializer
from config import config

logger = logging.getLogger(__name__)

class KafkaProducerClient:
    def __init__(self):
        self.producer = None

    def load_avro_schema(self):
        schema_path = os.path.join(os.path.dirname(__file__), "schemas", "price_tick.avsc")
        with open(schema_path, "r") as f:
            return f.read()

    def initialize(self):
        logger.info(f"Initializing Schema Registry client at {config.SCHEMA_REGISTRY_URL}")
        sr_client = SchemaRegistryClient({"url": config.SCHEMA_REGISTRY_URL})
        
        schema_str = self.load_avro_schema()
        avro_serializer = AvroSerializer(
            schema_registry_client=sr_client,
            schema_str=schema_str,
            to_dict=lambda obj, ctx: obj
        )
        
        producer_config = {
            "bootstrap.servers": config.REDPANDA_BROKERS,
            "key.serializer": StringSerializer("utf_8"),
            "value.serializer": avro_serializer,
            "acks": "all",
            "retries": 5,
            "retry.backoff.ms": 500
        }
        
        logger.info(f"Initializing Kafka producer with brokers {config.REDPANDA_BROKERS}")
        self.producer = SerializingProducer(producer_config)

    def delivery_report(self, err, msg):
        if err is not None:
            logger.error(f"Message delivery failed: {err}")

    def produce(self, topic: str, key: str, value: dict):
        if not self.producer:
            raise RuntimeError("Producer not initialized")
        self.producer.produce(
            topic=topic,
            key=key,
            value=value,
            on_delivery=self.delivery_report
        )

    def flush(self):
        if self.producer:
            self.producer.flush()

kafka_client = KafkaProducerClient()
