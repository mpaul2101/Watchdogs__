import time
import json
import psutil
import paho.mqtt.client as mqtt

BROKER = "localhost"
TOPIC = "metrics/cpu"

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1, "python-agent")
client.connect(BROKER, 1883)

print("Agent pornit...")
try:
    while True:
        payload = {
            "server_id": "nokia-server-01",
            "cpu": psutil.cpu_percent(interval=1),
            "timestamp": int(time.time())
        }
        client.publish(TOPIC, json.dumps(payload))
        print(f"Trimis: {payload}")
        time.sleep(4)
except KeyboardInterrupt:
    print("Oprire")