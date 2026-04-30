import time
import json
import psutil
import paho.mqtt.client as mqtt

BROKER = "localhost"
TOPIC = "metrics/cpu"
SERVER_ID = "nokia-server-01"

client = mqtt.Client(
    callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
    client_id="python-agent"
)
client.connect(BROKER, 1883)

print("Agent pornit...")
try:
    while True:
        payload = {
            "server_id": SERVER_ID,
            "cpu": psutil.cpu_percent(interval=1),
            "ram": psutil.virtual_memory().percent,
            "disk": psutil.disk_usage("/").percent,
            "timestamp": int(time.time())
        }
        client.publish(TOPIC, json.dumps(payload))
        print(f"Trimis: {payload}")
        time.sleep(4)
except KeyboardInterrupt:
    print("Oprire")
